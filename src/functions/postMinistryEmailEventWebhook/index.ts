import {
  getFeatureFlags
} from "../../config/featureFlags";
import {
  readMinistryEmailEventWebhookPublicKey
} from "../../config/ministryEmailEventWebhook";
import {
  SENDGRID_DELIVERY_ID_ARGUMENT,
  SENDGRID_DISPATCH_ATTEMPT_ID_ARGUMENT
} from "../../contracts/ministryEmailProviderEvidence.v1";
import {
  normalizeSendGridProviderEvent
} from "../../services/communications/normalizeSendGridProviderEvent";
import {
  verifySendGridEventWebhook
} from "../../services/communications/verifySendGridEventWebhook";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8"
};

const SIGNATURE_HEADER =
  "X-Twilio-Email-Event-Webhook-Signature";

const TIMESTAMP_HEADER =
  "X-Twilio-Email-Event-Webhook-Timestamp";

export type PostMinistryEmailEventWebhookDependencies = {
  getFlags?: () => {
    ministryEmailEventWebhook: boolean;
  };
  getPublicKey?: () => string;
  verify?: typeof verifySendGridEventWebhook;
  normalize?: typeof normalizeSendGridProviderEvent;
};

function readHeader(
  req: any,
  name: string
): string {
  const lowerName = name.toLowerCase();
  const upperName = name.toUpperCase();

  const value =
    (
      typeof req?.headers?.get === "function"
        ? req.headers.get(name)
        : null
    ) ??
    (
      typeof req?.headers?.get === "function"
        ? req.headers.get(lowerName)
        : null
    ) ??
    req?.headers?.[name] ??
    req?.headers?.[lowerName] ??
    req?.headers?.[upperName] ??
    req?.get?.(name) ??
    req?.get?.(lowerName) ??
    "";

  return String(value ?? "").trim();
}

function readRawBody(
  req: any
): Buffer | string | null {
  if (
    Buffer.isBuffer(req?.bufferBody) &&
    req.bufferBody.length > 0
  ) {
    return req.bufferBody;
  }

  if (
    typeof req?.rawBody === "string" &&
    req.rawBody.length > 0
  ) {
    return req.rawBody;
  }

  return null;
}

function correlationText(
  event: unknown,
  key: string
): string {
  if (
    !event ||
    typeof event !== "object" ||
    Array.isArray(event)
  ) {
    return "";
  }

  const value = (
    event as Record<string, unknown>
  )[key];

  return typeof value === "string"
    ? value
    : "";
}

export async function postMinistryEmailEventWebhook(
  context: any,
  req: any,
  dependencies: PostMinistryEmailEventWebhookDependencies = {}
): Promise<void> {
  const requestId = getRequestId(req);

  const flags = (
    dependencies.getFlags ??
    getFeatureFlags
  )();

  if (!flags.ministryEmailEventWebhook) {
    context.res = {
      status: 404,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_EVENT_WEBHOOK_DISABLED",
        "Ministry email event webhook is unavailable",
        requestId
      )
    };
    return;
  }

  const getPublicKey =
    dependencies.getPublicKey ??
    readMinistryEmailEventWebhookPublicKey;

  const publicKey = getPublicKey();

  if (!publicKey) {
    context.res = {
      status: 503,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_EVENT_WEBHOOK_NOT_CONFIGURED",
        "Ministry email event webhook verification is unavailable",
        requestId
      )
    };
    return;
  }

  const signature = readHeader(
    req,
    SIGNATURE_HEADER
  );

  const timestamp = readHeader(
    req,
    TIMESTAMP_HEADER
  );

  if (!signature || !timestamp) {
    context.res = {
      status: 401,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_EVENT_WEBHOOK_AUTH_REQUIRED",
        "Signed ministry email event webhook headers are required",
        requestId
      )
    };
    return;
  }

  const rawBody = readRawBody(req);

  if (rawBody === null) {
    context.res = {
      status: 400,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_EVENT_WEBHOOK_RAW_BODY_REQUIRED",
        "Original webhook payload is required",
        requestId
      )
    };
    return;
  }

  try {
    const verify =
      dependencies.verify ??
      verifySendGridEventWebhook;

    const verification = verify({
      rawBody,
      signature,
      timestamp,
      publicKey
    });

    if (!verification.ok) {
      const serverFailure =
        verification.code ===
          "INVALID_WEBHOOK_PUBLIC_KEY" ||
        verification.code ===
          "WEBHOOK_VERIFICATION_FAILED";

      context.res = {
        status: serverFailure ? 503 : 403,
        headers: jsonHeaders,
        body: apiErrorBody(
          verification.code,
          serverFailure
            ? "Ministry email event webhook verification is unavailable"
            : "Ministry email event webhook signature is invalid",
          requestId
        )
      };
      return;
    }

    const payloadText =
      Buffer.isBuffer(rawBody)
        ? rawBody.toString("utf8")
        : rawBody;

    let payload: unknown;

    try {
      payload = JSON.parse(payloadText);
    } catch {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body: apiErrorBody(
          "INVALID_MINISTRY_EMAIL_EVENT_WEBHOOK_PAYLOAD",
          "Signed ministry email event webhook payload is invalid",
          requestId
        )
      };
      return;
    }

    if (!Array.isArray(payload)) {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body: apiErrorBody(
          "INVALID_MINISTRY_EMAIL_EVENT_WEBHOOK_PAYLOAD",
          "Signed ministry email event webhook payload must be an array",
          requestId
        )
      };
      return;
    }

    const normalize =
      dependencies.normalize ??
      normalizeSendGridProviderEvent;

    let normalizedCount = 0;
    let ignoredCount = 0;

    for (const event of payload) {
      const expectedDeliveryId =
        correlationText(
          event,
          SENDGRID_DELIVERY_ID_ARGUMENT
        );

      const expectedDispatchAttemptId =
        correlationText(
          event,
          SENDGRID_DISPATCH_ATTEMPT_ID_ARGUMENT
        );

      const result = normalize({
        expectedDeliveryId,
        expectedDispatchAttemptId,
        provenance: {
          signatureVerified: true
        },
        event
      });

      if (result.ok) {
        normalizedCount += 1;
      }
      else {
        ignoredCount += 1;
      }
    }

    // Deliberately non-2xx until #1270 adds durable idempotent persistence.
    // This prevents an accidentally enabled pre-persistence endpoint from
    // acknowledging and losing SendGrid evidence.
    context.res = {
      status: 503,
      headers: jsonHeaders,
      body: {
        ...apiErrorBody(
          "MINISTRY_EMAIL_EVENT_WEBHOOK_PERSISTENCE_UNAVAILABLE",
          "Verified ministry email event evidence is not yet durably persisted",
          requestId
        ),
        ingestion: {
          receivedCount: payload.length,
          normalizedCount,
          ignoredCount,
          persisted: false
        }
      }
    };
  } catch (error: any) {
    logFunctionError(
      context,
      "postMinistryEmailEventWebhook",
      error,
      { requestId }
    );

    context.res = {
      status: 500,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_EVENT_WEBHOOK_FAILED",
        "Unexpected ministry email event webhook error",
        requestId
      )
    };
  }
}