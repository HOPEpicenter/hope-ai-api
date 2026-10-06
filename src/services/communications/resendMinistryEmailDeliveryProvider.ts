import {
  createHash
} from "node:crypto";
import type {
  ResendEmailSenderConfig
} from "../../config/resendEmailSender";
import {
  RESEND_DELIVERY_ID_TAG,
  RESEND_DISPATCH_ATTEMPT_ID_TAG
} from "../../contracts/ministryEmailProviderEvidence.v1";
import type {
  MinistryEmailDeliveryProviderAdapter,
  MinistryEmailProviderRequest,
  MinistryEmailProviderResult
} from "./ministryEmailDeliveryProvider";

const RESEND_EMAIL_ENDPOINT =
  "https://api.resend.com/emails";

const TAG_VALUE_PATTERN =
  /^[A-Za-z0-9_-]{1,256}$/;

type ResendHttpResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

export type ResendSenderFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  }
) => Promise<ResendHttpResponse>;

function hasText(
  value: unknown,
  maxLength: number
): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= maxLength;
}

function tagCompatible(
  value: unknown
): value is string {
  return typeof value === "string" &&
    TAG_VALUE_PATTERN.test(value);
}

function idempotencyKey(
  request: MinistryEmailProviderRequest
): string {
  const digest =
    createHash("sha256")
      .update(
        `${request.deliveryId}\n${request.dispatchAttemptId}`,
        "utf8"
      )
      .digest("hex");

  return `hope-email-${digest}`;
}

function errorType(
  payload: unknown
): string | null {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const record =
    payload as Record<string, unknown>;

  const type =
    record.name ??
    record.type;

  if (
    typeof type !== "string" ||
    !/^[a-z0-9_]{1,64}$/.test(type)
  ) {
    return null;
  }

  return type;
}

async function readJson(
  response: ResendHttpResponse
): Promise<unknown> {
  try {
    return await response.json();
  }
  catch {
    return null;
  }
}

function validateRequest(
  request: MinistryEmailProviderRequest
): boolean {
  return (
    tagCompatible(
      request.deliveryId
    ) &&
    tagCompatible(
      request.dispatchAttemptId
    ) &&
    hasText(
      request.recipientEmail,
      512
    ) &&
    hasText(
      request.subject,
      998
    ) &&
    typeof request.body === "string" &&
    request.body.length > 0
  );
}

/**
 * Concrete Resend transport adapter.
 *
 * The adapter receives only an already-claimed delivery request. It sends the
 * correlation tags required by the verified webhook path and derives a stable
 * idempotency key from the durable delivery/attempt pair.
 *
 * It performs no delivery persistence, recovery resolution, retry, ministry
 * outcome mutation, or Six-Week mutation.
 */
export class ResendMinistryEmailDeliveryProvider
implements MinistryEmailDeliveryProviderAdapter {
  constructor(
    private readonly config:
      ResendEmailSenderConfig,
    private readonly fetchImpl:
      ResendSenderFetch =
        async (url, init) => {
          const response =
            await fetch(
              url,
              init
            );

          return response;
        }
  ) {
    if (
      !hasText(
        config?.apiKey,
        8192
      ) ||
      !hasText(
        config?.from,
        512
      )
    ) {
      throw new Error(
        "Resend sender configuration is invalid"
      );
    }
  }

  async send(
    request: MinistryEmailProviderRequest
  ): Promise<MinistryEmailProviderResult> {
    if (!validateRequest(request)) {
      return {
        accepted: false,
        provider: "resend",
        failureCode:
          "resend_invalid_request"
      };
    }

    const body =
      JSON.stringify({
        from:
          this.config.from,
        to: [
          request.recipientEmail
        ],
        subject:
          request.subject,
        text:
          request.body,
        tags: [
          {
            name:
              RESEND_DELIVERY_ID_TAG,
            value:
              request.deliveryId
          },
          {
            name:
              RESEND_DISPATCH_ATTEMPT_ID_TAG,
            value:
              request.dispatchAttemptId
          }
        ]
      });

    const response =
      await this.fetchImpl(
        RESEND_EMAIL_ENDPOINT,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${this.config.apiKey}`,
            "Content-Type":
              "application/json",
            "Idempotency-Key":
              idempotencyKey(
                request
              )
          },
          body
        }
      );

    const payload =
      await readJson(response);

    if (response.ok) {
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload)
      ) {
        throw new Error(
          "Resend accepted response was malformed"
        );
      }

      const providerMessageId =
        (
          payload as Record<string, unknown>
        ).id;

      if (
        !hasText(
          providerMessageId,
          512
        )
      ) {
        throw new Error(
          "Resend accepted response did not include an email id"
        );
      }

      return {
        accepted: true,
        provider: "resend",
        providerMessageId
      };
    }

    const providerError =
      errorType(payload);

    if (
      response.status === 409 &&
      providerError ===
        "concurrent_idempotent_requests"
    ) {
      throw new Error(
        "Resend idempotent request is concurrently unresolved"
      );
    }

    if (
      response.status === 429 ||
      response.status >= 500 ||
      response.status < 400
    ) {
      throw new Error(
        "Resend provider execution is uncertain"
      );
    }

    if (
      response.status >= 400 &&
      response.status < 500
    ) {
      return {
        accepted: false,
        provider: "resend",
        failureCode:
          providerError
            ? `resend_${providerError}`
            : `resend_http_${response.status}`
      };
    }

    throw new Error(
      "Resend provider execution is uncertain"
    );
  }
}