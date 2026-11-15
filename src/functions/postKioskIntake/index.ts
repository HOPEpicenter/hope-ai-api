import { Buffer } from "node:buffer";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  submitKioskIntakeV1
} from "../../services/visitors/submitKioskIntakeV1";

import {
  reserveKioskAdmissionSlotV1
} from "../../services/visitors/reserveKioskAdmissionSlotV1";

type Dependencies = {
  reserveAdmission?: typeof reserveKioskAdmissionSlotV1;
  submit?: typeof submitKioskIntakeV1;
};

const MAX_BODY_BYTES = 8192;
const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function readHeader(req: any, name: string): string {
  const headers = req?.headers;

  const value =
    (typeof headers?.get === "function"
      ? headers.get(name)
      : undefined) ??
    headers?.[name.toLowerCase()] ??
    headers?.[name] ??
    "";

  return typeof value === "string" ? value.trim() : "";
}

function reply(
  context: any,
  status: number,
  body: Record<string, unknown>
): void {
  context.res = {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    },
    body
  };
}

/**
 * Server-to-server backend endpoint.
 *
 * The HTTP trigger is anonymous at the Azure Functions
 * platform layer, but this handler requires HOPE_API_KEY.
 *
 * The browser must NEVER call this route directly.
 * No public visitor authorization is granted here.
 */
export async function postKioskIntake(
  context: any,
  req: any,
  dependencies: Dependencies = {}
): Promise<void> {
  const auth = requireApiKeyForFunction(req);

  if (!auth.ok) {
    reply(context, auth.status, {
      accepted: false,
      error: "NOT_AUTHORIZED"
    });
    return;
  }

  if (
    process.env.HOPE_KIOSK_BACKEND_INGRESS_ENABLED !== "true"
  ) {
    reply(context, 404, {
      accepted: false,
      error: "NOT_AVAILABLE"
    });
    return;
  }

  // Capacity enforcement is mandatory once ingress is enabled.
  // No HTTP caller may control this feature gate.
  if (
    process.env.HOPE_KIOSK_CAPACITY_GUARD_ENABLED !== "true"
  ) {
    reply(context, 404, {
      accepted: false,
      error: "NOT_AVAILABLE"
    });
    return;
  }

  const contentType = readHeader(req, "content-type");

  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      contentType
    )
  ) {
    reply(context, 415, {
      accepted: false,
      error: "UNSUPPORTED_MEDIA_TYPE"
    });
    return;
  }

  const submissionId = readHeader(req, "idempotency-key");

  if (!UUID4.test(submissionId)) {
    reply(context, 400, {
      accepted: false,
      error: "INVALID_SUBMISSION"
    });
    return;
  }

  const body = req?.body;
  const raw = req?.rawBody;

  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    reply(context, 400, {
      accepted: false,
      error: "INVALID_SUBMISSION"
    });
    return;
  }

  try {
    const size =
      typeof raw === "string" || Buffer.isBuffer(raw)
        ? Buffer.byteLength(raw)
        : Buffer.byteLength(JSON.stringify(body));

    if (size > MAX_BODY_BYTES) {
      reply(context, 413, {
        accepted: false,
        error: "SUBMISSION_TOO_LARGE"
      });
      return;
    }

    // Reserve capacity only after API-key authentication and
    // basic request checks. This is a shared global quota,
    // not guest or device authentication.
    const reserve =
      dependencies.reserveAdmission ??
      reserveKioskAdmissionSlotV1;

    const admission = await reserve({ enabled: true });

    if (!admission.admitted) {
      reply(context, 429, {
        accepted: false,
        error: "REGISTRATION_LIMIT_REACHED"
      });
      return;
    }

    const submit = dependencies.submit ?? submitKioskIntakeV1;

    // Authentication was already established by the server-side
    // API-key guard above. This callback cannot be caller-supplied.
    const result = await submit(body, submissionId, {
      authorizeRequest: async () => true
    });

    switch (result.status) {
      case "recorded":
        reply(context, 202, {
          accepted: true,
          status: "recorded"
        });
        return;

      case "already_recorded":
        reply(context, 200, {
          accepted: true,
          status: "already_recorded"
        });
        return;

      case "invalid":
        reply(context, 400, {
          accepted: false,
          status: "invalid"
        });
        return;

      case "idempotency_conflict":
        reply(context, 409, {
          accepted: false,
          status: "idempotency_conflict"
        });
        return;

      default:
        reply(context, 403, {
          accepted: false,
          error: "NOT_AVAILABLE"
        });
        return;
    }
  } catch {
    // Never return exception text, request content, or guest PII.
    reply(context, 503, {
      accepted: false,
      error: "REGISTRATION_UNAVAILABLE"
    });
  }
}