import {
  getFeatureFlags
} from "../../config/featureFlags";
import {
  readMinistryEmailEventWebhookPublicKey
} from "../../config/ministryEmailEventWebhook";
import {
  SENDGRID_ACCEPTANCE_EVENT_TYPES,
  SENDGRID_DELIVERY_ID_ARGUMENT,
  SENDGRID_DISPATCH_ATTEMPT_ID_ARGUMENT
} from "../../contracts/ministryEmailProviderEvidence.v1";
import type {
  PersistMinistryEmailProviderEvidenceInputV1
} from "../../contracts/ministryEmailProviderEvidencePersistence.v1";
import type {
  MinistryEmailDeliveryRecord
} from "../../domain/communications/ministryEmailDeliveryContracts";
import {
  MinistryEmailDeliveriesRepository
} from "../../repositories/ministryEmailDeliveriesRepository";
import {
  normalizeSendGridProviderEvent
} from "../../services/communications/normalizeSendGridProviderEvent";
import {
  persistMinistryEmailProviderEvidence
} from "../../services/communications/persistMinistryEmailProviderEvidence";
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

const ACCEPTANCE_EVENT_TYPES =
  new Set<string>(
    SENDGRID_ACCEPTANCE_EVENT_TYPES
  );

export type PostMinistryEmailEventWebhookDependencies = {
  getFlags?: () => {
    ministryEmailEventWebhook: boolean;
  };
  getPublicKey?: () => string;
  verify?: typeof verifySendGridEventWebhook;
  normalize?: typeof normalizeSendGridProviderEvent;
  readDelivery?: (
    deliveryId: string
  ) => Promise<MinistryEmailDeliveryRecord | null>;
  persist?: typeof persistMinistryEmailProviderEvidence;
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

    const persist =
      dependencies.persist ??
      persistMinistryEmailProviderEvidence;

    const normalized:
      PersistMinistryEmailProviderEvidenceInputV1[] =
        [];

    const batchEvidence =
      new Map<string, string>();

    let ignoredCount = 0;

    /*
     * Phase 1 performs all canonical-delivery correlation and detects
     * conflicting duplicate evidence identities before any storage write.
     */
    for (const event of payload) {
      const eventType =
        event &&
        typeof event === "object" &&
        !Array.isArray(event)
          ? (
              event as Record<
                string,
                unknown
              >
            ).event
          : undefined;

      if (
        typeof eventType === "string" &&
        !ACCEPTANCE_EVENT_TYPES.has(
          eventType
        )
      ) {
        ignoredCount += 1;
        continue;
      }

      const eventDeliveryId =
        correlationText(
          event,
          SENDGRID_DELIVERY_ID_ARGUMENT
        );

      const eventDispatchAttemptId =
        correlationText(
          event,
          SENDGRID_DISPATCH_ATTEMPT_ID_ARGUMENT
        );

      if (
        !eventDeliveryId ||
        !eventDispatchAttemptId
      ) {
        context.res = {
          status: 400,
          headers: jsonHeaders,
          body: apiErrorBody(
            "INVALID_MINISTRY_EMAIL_PROVIDER_EVENT",
            "Signed ministry email provider event correlation is invalid",
            requestId
          )
        };
        return;
      }

      let delivery:
        MinistryEmailDeliveryRecord |
        null;

      try {
        delivery =
          await readDelivery(
            eventDeliveryId
          );
      } catch {
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

      const result = normalize({
        expectedDeliveryId:
          delivery.deliveryId,
        expectedDispatchAttemptId:
          canonicalAttemptId,
        provenance: {
          signatureVerified: true
        },
        event
      });

      if (!result.ok) {
        context.res = {
          status:
            result.code ===
              "PROVIDER_EVENT_CORRELATION_MISMATCH"
              ? 409
              : 400,
          headers: jsonHeaders,
          body: apiErrorBody(
            result.code,
            "Signed ministry email provider event is invalid",
            requestId
          )
        };
        return;
      }

      const input:
        PersistMinistryEmailProviderEvidenceInputV1 =
        {
          eventType: result.eventType,
          evidence: result.evidence
        };

      const canonical =
        JSON.stringify(input);

      const prior =
        batchEvidence.get(
          input.evidence.evidenceId
        );

      if (
        prior !== undefined &&
        prior !== canonical
      ) {
        context.res = {
          status: 409,
          headers: jsonHeaders,
          body: apiErrorBody(
            "PROVIDER_EVIDENCE_BATCH_CONFLICT",
            "Signed provider evidence batch contains a conflicting replay identity",
            requestId
          )
        };
        return;
      }

      batchEvidence.set(
        input.evidence.evidenceId,
        canonical
      );

      normalized.push(input);
    }

    /*
     * Phase 2 writes only after the whole supported batch has passed
     * canonical correlation and in-batch replay checks.
     *
     * Writes are individually idempotent. If a later write fails, SendGrid
     * receives non-2xx; a retry safely replays rows already committed.
     */
    let persistedCount = 0;
    let replayedCount = 0;

    for (const input of normalized) {
      const result =
        await persist(input);

      if (!result.ok) {
        const status =
          result.code ===
            "PROVIDER_EVIDENCE_REPLAY_CONFLICT"
            ? 409
            : result.code ===
                "INVALID_PROVIDER_EVIDENCE"
              ? 400
              : 503;

        context.res = {
          status,
          headers: jsonHeaders,
          body: apiErrorBody(
            result.code,
            status === 503
              ? "Ministry email provider evidence persistence is unavailable"
              : "Ministry email provider evidence cannot be accepted",
            requestId
          )
        };
        return;
      }

      if (result.status === "persisted") {
        persistedCount += 1;
      }
      else {
        replayedCount += 1;
      }
    }

    context.res = {
      status: 200,
      headers: jsonHeaders,
      body: {
        ingestion: {
          receivedCount:
            payload.length,
          persistedCount,
          replayedCount,
          ignoredCount,
          persisted: true
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