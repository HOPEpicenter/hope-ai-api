import { Buffer } from "node:buffer";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  submitKioskIntakeV1
} from "../../services/visitors/submitKioskIntakeV1";

import {
  reserveKioskAdmissionSlotV1
} from "../../services/visitors/reserveKioskAdmissionSlotV1";

import {
  verifyKioskDevicePassV1
} from "../../services/visitors/verifyKioskDevicePassV1";
import {
  assessKioskDeviceV1
} from "../../services/visitors/kioskDeviceRegistryV1";

import {
  reserveKioskDeviceSlotV1
} from "../../services/visitors/reserveKioskDeviceSlotV1";

import {
  inspectExistingKioskIntakeSubmissionV1
} from "../../repositories/kioskIntakeSubmissionsRepositoryV1";

type Dependencies = {
  inspectRetry?: typeof inspectExistingKioskIntakeSubmissionV1;
  reserveDeviceSlot?: typeof reserveKioskDeviceSlotV1;
  verifyDevicePass?: typeof verifyKioskDevicePassV1;
  assessDevice?: typeof assessKioskDeviceV1;
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

  // Device-specific capacity is mandatory for enabled intake.
  if (
    process.env.HOPE_KIOSK_DEVICE_CAPACITY_GUARD_ENABLED !== "true"
  ) {
    reply(context, 404, {
      accepted: false,
      error: "NOT_AVAILABLE"
    });
    return;
  }

  if (
    process.env.HOPE_KIOSK_DEVICE_VERIFICATION_ENABLED !== "true"
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

    // Backend independently verifies the signed device pass.
    // The browser cannot assert a trusted device ID.
    const pass = readHeader(req, "x-kiosk-device-pass");

    if (!pass || pass.length > 1024) {
      reply(context, 403, {
        accepted: false,
        error: "DEVICE_NOT_AUTHORIZED"
      });
      return;
    }

    const verify =
      dependencies.verifyDevicePass ??
      verifyKioskDevicePassV1;

    const device = verify(
      pass,
      process.env.HOPE_KIOSK_DEVICE_SIGNING_SECRET ?? ""
    );

    if (!device) {
      reply(context, 403, {
        accepted: false,
        error: "DEVICE_NOT_AUTHORIZED"
      });
      return;
    }

    // Read authoritative registry state before capacity
    // reservation or any visitor persistence.
    const assess =
      dependencies.assessDevice ?? assessKioskDeviceV1;

    const active = await assess(
      device.deviceId,
      device.expiresAtSeconds,
      { enabled: true }
    );

    if (!active) {
      reply(context, 403, {
        accepted: false,
        error: "DEVICE_NOT_AUTHORIZED"
      });
      return;
    }

    // A retry receipt must never bypass the existing
    // public-intake feature gate.
    // Preserve the existing downstream disabled response.
    if (
      process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED !== "true"
    ) {
      reply(context, 403, {
        accepted: false,
        error: "NOT_AVAILABLE"
      });
      return;
    }

    // Inspect an existing completed submission only AFTER
    // verifying the signed device and live registry state.
    // This is a status-only, read-only operation.
    const inspectRetry =
      dependencies.inspectRetry ??
      inspectExistingKioskIntakeSubmissionV1;

    const retryStatus = await inspectRetry(
      body,
      submissionId,
      { enabled: true }
    );

    switch (retryStatus) {
      case "already_recorded":
        reply(context, 200, {
          accepted: true,
          status: "already_recorded"
        });
        return;

      case "idempotency_conflict":
        reply(context, 409, {
          accepted: false,
          status: "idempotency_conflict"
        });
        return;

      case "invalid":
        reply(context, 400, {
          accepted: false,
          status: "invalid"
        });
        return;

      case "missing":
        // Only new submissions proceed to capacity checks.
        break;

      default:
        // Disabled or unexpected repository status:
        // do not admit or consume capacity.
        reply(context, 503, {
          accepted: false,
          error: "REGISTRATION_UNAVAILABLE"
        });
        return;
    }

    // Device identity comes from the verified signed pass.
    // The registry check has already succeeded.
    // No visitor data is persisted before this reservation.
    const reserveDevice =
      dependencies.reserveDeviceSlot ??
      reserveKioskDeviceSlotV1;

    const deviceAdmission = await reserveDevice(
      device.deviceId,
      { enabled: true }
    );

    if (!deviceAdmission.admitted) {
      reply(context, 429, {
        accepted: false,
        error: "DEVICE_RATE_LIMIT_REACHED"
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