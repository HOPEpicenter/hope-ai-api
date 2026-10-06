import {
  getFeatureFlags
} from "../../config/featureFlags";
import {
  readResendMinistryEmailEventWebhookSigningSecret
} from "../../config/ministryEmailEventWebhook";
import {
  readMinistryEmailProviderSelection
} from "../../config/ministryEmailProviderSelection";
import {
  RESEND_DELIVERY_EVIDENCE_EVENT_TYPES,
  RESEND_DELIVERY_ID_TAG,
  RESEND_DISPATCH_ATTEMPT_ID_TAG
} from "../../contracts/ministryEmailProviderEvidence.v1";
import type {
  MinistryEmailDeliveryRecord
} from "../../domain/communications/ministryEmailDeliveryContracts";
import {
  MinistryEmailDeliveriesRepository
} from "../../repositories/ministryEmailDeliveriesRepository";
import {
  normalizeResendProviderEvent
} from "../../services/communications/normalizeResendProviderEvent";
import {
  persistMinistryEmailProviderEvidence
} from "../../services/communications/persistMinistryEmailProviderEvidence";
import {
  verifyResendEventWebhook
} from "../../services/communications/verifyResendEventWebhook";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

const jsonHeaders = {
  "content-type":
    "application/json; charset=utf-8"
};

const MESSAGE_ID_HEADER = "svix-id";
const TIMESTAMP_HEADER = "svix-timestamp";
const SIGNATURE_HEADER = "svix-signature";

const DELIVERY_EVENT_TYPES =
  new Set<string>(
    RESEND_DELIVERY_EVIDENCE_EVENT_TYPES
  );

export type PostMinistryEmailResendEventWebhookDependencies = {
  getFlags?: () => {
    ministryEmailEventWebhook: boolean;
  };
  getProvider?: () =>
    "resend" |
    "sendgrid" |
    "ses" |
    null;
  getSigningSecret?: () => string;
  verify?: typeof verifyResendEventWebhook;
  normalize?: typeof normalizeResendProviderEvent;
  persist?: typeof persistMinistryEmailProviderEvidence;
  readDelivery?: (
    deliveryId: string
  ) => Promise<MinistryEmailDeliveryRecord | null>;
};

function readHeader(
  req: any,
  name: string
): string {
  const lowerName =
    name.toLowerCase();

  const upperName =
    name.toUpperCase();

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

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function tagText(
  event: unknown,
  name: string
): string {
  if (!isObject(event)) {
    return "";
  }

  const data = event.data;

  if (!isObject(data)) {
    return "";
  }

  const tags = data.tags;

  if (!isObject(tags)) {
    return "";
  }

  const value = tags[name];

  return typeof value === "string"
    ? value
    : "";
}

export async function postMinistryEmailResendEventWebhook(
  context: any,
  req: any,
  dependencies:
    PostMinistryEmailResendEventWebhookDependencies = {}
): Promise<void> {
  const requestId =
    getRequestId(req);

  const flags = (
    dependencies.getFlags ??
    getFeatureFlags
  )();

  if (!flags.ministryEmailEventWebhook) {
    context.res = {
      status: 404,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_DISABLED",
        "Resend ministry email event webhook is unavailable",
        requestId
      )
    };
    return;
  }

  const provider = (
    dependencies.getProvider ??
    readMinistryEmailProviderSelection
  )();

  if (provider !== "resend") {
    context.res = {
      status: 404,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_RESEND_PROVIDER_NOT_ACTIVE",
        "Resend ministry email event webhook is unavailable",
        requestId
      )
    };
    return;
  }

  const getSigningSecret =
    dependencies.getSigningSecret ??
    readResendMinistryEmailEventWebhookSigningSecret;

  const signingSecret =
    getSigningSecret();

  if (!signingSecret) {
    context.res = {
      status: 503,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_NOT_CONFIGURED",
        "Resend ministry email event webhook verification is unavailable",
        requestId
      )
    };
    return;
  }

  const messageId =
    readHeader(req, MESSAGE_ID_HEADER);

  const timestamp =
    readHeader(req, TIMESTAMP_HEADER);

  const signature =
    readHeader(req, SIGNATURE_HEADER);

  if (
    !messageId ||
    !timestamp ||
    !signature
  ) {
    context.res = {
      status: 401,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_AUTH_REQUIRED",
        "Signed Resend webhook headers are required",
        requestId
      )
    };
    return;
  }

  const rawBody =
    readRawBody(req);

  if (rawBody === null) {
    context.res = {
      status: 400,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_RAW_BODY_REQUIRED",
        "Original Resend webhook payload is required",
        requestId
      )
    };
    return;
  }

  try {
    const verify =
      dependencies.verify ??
      verifyResendEventWebhook;

    const verification =
      verify({
        rawBody,
        messageId,
        timestamp,
        signature,
        signingSecret
      });

    if (!verification.ok) {
      const serverFailure =
        verification.code ===
          "INVALID_WEBHOOK_SIGNING_SECRET" ||
        verification.code ===
          "WEBHOOK_VERIFICATION_FAILED";

      context.res = {
        status:
          serverFailure
            ? 503
            : 403,
        headers: jsonHeaders,
        body: apiErrorBody(
          verification.code,
          serverFailure
            ? "Resend webhook verification is unavailable"
            : "Resend webhook signature is invalid",
          requestId
        )
      };
      return;
    }

    const payloadText =
      Buffer.isBuffer(rawBody)
        ? rawBody.toString("utf8")
        : rawBody;

    let event: unknown;

    try {
      event =
        JSON.parse(payloadText);
    }
    catch {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body: apiErrorBody(
          "INVALID_MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_PAYLOAD",
          "Signed Resend webhook payload is invalid",
          requestId
        )
      };
      return;
    }

    if (!isObject(event)) {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body: apiErrorBody(
          "INVALID_MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_PAYLOAD",
          "Signed Resend webhook payload must be an object",
          requestId
        )
      };
      return;
    }

    const eventType =
      event.type;

    if (
      typeof eventType === "string" &&
      !DELIVERY_EVENT_TYPES.has(
        eventType
      )
    ) {
      context.res = {
        status: 200,
        headers: jsonHeaders,
        body: {
          ingestion: {
            receivedCount: 1,
            normalizedCount: 0,
            ignoredCount: 1,
            persisted: false
          }
        }
      };
      return;
    }

    const eventDeliveryId =
      tagText(
        event,
        RESEND_DELIVERY_ID_TAG
      );

    const eventDispatchAttemptId =
      tagText(
        event,
        RESEND_DISPATCH_ATTEMPT_ID_TAG
      );

    if (
      !eventDeliveryId ||
      !eventDispatchAttemptId
    ) {
      context.res = {
        status: 400,
        headers: jsonHeaders,
        body: apiErrorBody(
          "INVALID_MINISTRY_EMAIL_RESEND_PROVIDER_EVENT",
          "Signed Resend provider event correlation is invalid",
          requestId
        )
      };
      return;
    }

    const deliveryRepository =
      dependencies.readDelivery
        ? null
        : new MinistryEmailDeliveriesRepository();

    const readDelivery =
      dependencies.readDelivery ??
      (
        (deliveryId: string) =>
          deliveryRepository!.getById(
            deliveryId
          )
      );

    let delivery:
      MinistryEmailDeliveryRecord |
      null;

    try {
      delivery =
        await readDelivery(
          eventDeliveryId
        );
    }
    catch {
      context.res = {
        status: 503,
        headers: jsonHeaders,
        body: apiErrorBody(
          "MINISTRY_EMAIL_PROVIDER_EVIDENCE_LOOKUP_UNAVAILABLE",
          "Ministry email provider evidence correlation is unavailable",
          requestId
        )
      };
      return;
    }

    if (!delivery) {
      context.res = {
        status: 409,
        headers: jsonHeaders,
        body: apiErrorBody(
          "MINISTRY_EMAIL_PROVIDER_DELIVERY_NOT_FOUND",
          "Signed provider evidence does not match a canonical delivery",
          requestId
        )
      };
      return;
    }

    const canonicalAttemptId =
      delivery.dispatchAttemptId;

    if (
      !canonicalAttemptId ||
      canonicalAttemptId !==
        eventDispatchAttemptId
    ) {
      context.res = {
        status: 409,
        headers: jsonHeaders,
        body: apiErrorBody(
          "MINISTRY_EMAIL_PROVIDER_DISPATCH_ATTEMPT_CONFLICT",
          "Signed provider evidence does not match the canonical dispatch attempt",
          requestId
        )
      };
      return;
    }

    const normalize =
      dependencies.normalize ??
      normalizeResendProviderEvent;

    const normalized =
      normalize({
        expectedDeliveryId:
          delivery.deliveryId,
        expectedDispatchAttemptId:
          canonicalAttemptId,
        evidenceId:
          messageId,
        provenance: {
          signatureVerified: true
        },
        event
      });

    if (!normalized.ok) {
      context.res = {
        status:
          normalized.code ===
            "PROVIDER_EVENT_CORRELATION_MISMATCH"
            ? 409
            : 400,
        headers: jsonHeaders,
        body: apiErrorBody(
          normalized.code,
          "Signed Resend ministry email provider event is invalid",
          requestId
        )
      };
      return;
    }

    const persist =
      dependencies.persist ??
      persistMinistryEmailProviderEvidence;

    const persisted =
      await persist({
        eventType:
          normalized.eventType,
        evidence:
          normalized.evidence
      });

    if (!persisted.ok) {
      const status =
        persisted.code ===
          "PROVIDER_EVIDENCE_REPLAY_CONFLICT"
          ? 409
          : persisted.code ===
              "INVALID_PROVIDER_EVIDENCE"
            ? 400
            : 503;

      context.res = {
        status,
        headers: jsonHeaders,
        body: apiErrorBody(
          persisted.code,
          status === 503
            ? "Resend ministry email provider evidence persistence is unavailable"
            : "Resend ministry email provider evidence cannot be accepted",
          requestId
        )
      };
      return;
    }

    context.res = {
      status: 200,
      headers: jsonHeaders,
      body: {
        ingestion: {
          receivedCount: 1,
          persistedCount:
            persisted.status ===
              "persisted"
              ? 1
              : 0,
          replayedCount:
            persisted.status ===
              "replayed"
              ? 1
              : 0,
          ignoredCount: 0,
          persisted: true
        }
      }
    };
  }
  catch (error: any) {
    logFunctionError(
      context,
      "postMinistryEmailResendEventWebhook",
      error,
      { requestId }
    );

    context.res = {
      status: 500,
      headers: jsonHeaders,
      body: apiErrorBody(
        "MINISTRY_EMAIL_RESEND_EVENT_WEBHOOK_FAILED",
        "Unexpected Resend ministry email event webhook error",
        requestId
      )
    };
  }
}