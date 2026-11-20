import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import { assessKioskIntakeV1 } from
  "../../services/visitors/assessKioskIntakeV1";
import { verifyKioskGuestQrGrantV1 } from
  "../../services/visitors/kioskGuestQrGrantV1";
import { reserveKioskGuestQrSlotV1 } from
  "../../services/visitors/reserveKioskGuestQrSlotV1";
import { reserveKioskAdmissionSlotV1 } from
  "../../services/visitors/reserveKioskAdmissionSlotV1";
import { inspectExistingKioskIntakeSubmissionV1 } from
  "../../repositories/kioskIntakeSubmissionsRepositoryV1";
import { submitKioskIntakeV1 } from
  "../../services/visitors/submitKioskIntakeV1";

const SITE = "hope-kiosk-acceptance-api";
const MAX_BYTES = 8192;
const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Dependencies = {
  nowMs?: () => number;
  verifyGrant?: typeof verifyKioskGuestQrGrantV1;
  inspectRetry?: typeof inspectExistingKioskIntakeSubmissionV1;
  reserveGuest?: typeof reserveKioskGuestQrSlotV1;
  reserveGlobal?: typeof reserveKioskAdmissionSlotV1;
  submit?: typeof submitKioskIntakeV1;
};

function header(req: any, name: string): string {
  const value =
    (typeof req?.headers?.get === "function"
      ? req.headers.get(name)
      : undefined) ??
    req?.headers?.[name];

  return typeof value === "string" ? value.trim() : "";
}

function reply(
  context: any,
  status: number,
  errorOrStatus: string,
  accepted = false
): void {
  context.res = {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    },
    body: accepted
      ? { accepted: true, status: errorOrStatus }
      : { accepted: false, error: errorOrStatus }
  };
}

/**
 * Private server-to-server QR intake adapter.
 *
 * The dashboard must keep HOPE_API_KEY on the server.
 * Never call this endpoint directly from guest JavaScript.
 *
 * The signed QR grant is not a Staff credential, an
 * administrator credential, or an iPad device pass.
 *
 * Dependency injection is solely for synthetic tests;
 * HTTP requests cannot provide these dependencies.
 */
export async function postKioskGuestQrIntake(
  context: any,
  req: any,
  dependencies: Dependencies = {}
): Promise<void> {
  if (
    process.env.WEBSITE_SITE_NAME !== SITE ||
    process.env.HOPE_KIOSK_GUEST_QR_INGRESS_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_BACKEND_INGRESS_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_CAPACITY_GUARD_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_GUEST_QR_RATE_LIMIT_ENABLED !== "true"
  ) {
    reply(context, 404, "NOT_AVAILABLE");
    return;
  }

  const auth = requireApiKeyForFunction(req);

  if (!auth.ok) {
    reply(
      context,
      auth.status === 500 ? 503 : 401,
      "NOT_AUTHORIZED"
    );
    return;
  }

  const contentType = header(req, "content-type");

  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      contentType
    )
  ) {
    reply(context, 415, "UNSUPPORTED_MEDIA_TYPE");
    return;
  }

  const submissionId = header(req, "idempotency-key");

  if (!UUID4.test(submissionId)) {
    reply(context, 400, "INVALID_SUBMISSION");
    return;
  }

  const declaredLength = header(req, "content-length");

  if (
    declaredLength &&
    (
      !/^\d+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_BYTES
    )
  ) {
    reply(context, 413, "SUBMISSION_TOO_LARGE");
    return;
  }

  const body = req?.body;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    reply(context, 400, "INVALID_SUBMISSION");
    return;
  }

  try {
    const raw = req?.rawBody;
    const size =
      typeof raw === "string" || Buffer.isBuffer(raw)
        ? Buffer.byteLength(raw)
        : Buffer.byteLength(JSON.stringify(body));

    if (size > MAX_BYTES) {
      reply(context, 413, "SUBMISSION_TOO_LARGE");
      return;
    }

    // Reject invalid visitor data before consuming quotas.
    const assessment = assessKioskIntakeV1(body);
    if (!assessment.valid) {
      reply(context, 400, "INVALID_SUBMISSION");
      return;
    }

    const grantToken = header(
      req, "x-kiosk-guest-qr-grant"
    );

    if (!grantToken || grantToken.length > 1024) {
      reply(context, 403, "GUEST_ADMISSION_DENIED");
      return;
    }

    const nowMs = (
      dependencies.nowMs ?? (() => Date.now())
    )();

    if (
      !Number.isSafeInteger(nowMs) ||
      nowMs < 0
    ) {
      reply(context, 503, "REGISTRATION_UNAVAILABLE");
      return;
    }

    const verify = dependencies.verifyGrant ??
      verifyKioskGuestQrGrantV1;

    const grant = verify(
      grantToken,
      process.env.HOPE_KIOSK_GUEST_QR_SIGNING_SECRET ?? "",
      { enabled: true },
      nowMs
    );

    if (!grant) {
      reply(context, 403, "GUEST_ADMISSION_DENIED");
      return;
    }

    // A verified grant is required before inspecting
    // whether an existing submission ID is present.
    const inspect = dependencies.inspectRetry ??
      inspectExistingKioskIntakeSubmissionV1;

    const retry = await inspect(
      body,
      submissionId,
      {
        enabled: true,
        source: "hope_guest_qr_v1"
      }
    );

    if (retry === "already_recorded") {
      reply(context, 200, "already_recorded", true);
      return;
    }

    if (retry === "idempotency_conflict") {
      reply(context, 409, "INVALID_OR_CONFLICTING_SUBMISSION");
      return;
    }

    if (retry === "invalid") {
      reply(context, 400, "INVALID_SUBMISSION");
      return;
    }

    if (retry !== "missing") {
      reply(context, 503, "REGISTRATION_UNAVAILABLE");
      return;
    }

    // Never borrow the paired-iPad per-device quota.
    const reserveGuest = dependencies.reserveGuest ??
      reserveKioskGuestQrSlotV1;

    // One event-wide claim per verified guest session.
    // Previously recorded identical retries return above.
    const guestAdmission = await reserveGuest(
      grant.grantId,
      {
        enabled: true,
        now: new Date(nowMs),
        capacity: 1,
        scope: "event",
        // No visitor fields enter the admission table.
        // The canonical intake repository remains the
        // final authority for durable idempotent writes.
        claimHash: createHash("sha256")
          .update(submissionId)
          .update("\n")
          .update(JSON.stringify(assessment.intake))
          .digest("hex")
      }
    );

    if (!guestAdmission.admitted) {
      reply(context, 429, "REGISTRATION_RATE_LIMIT_REACHED");
      return;
    }

    // Share the existing event-wide capacity limit.
    const reserveGlobal = dependencies.reserveGlobal ??
      reserveKioskAdmissionSlotV1;

    const globalAdmission = await reserveGlobal({
      enabled: true,
      now: () => new Date(nowMs)
    });

    if (!globalAdmission.admitted) {
      reply(context, 429, "REGISTRATION_LIMIT_REACHED");
      return;
    }

    const submit = dependencies.submit ??
      submitKioskIntakeV1;

    const result = await submit(
      body,
      submissionId,
      {
        // Reached only after all backend checks.
        authorizeRequest: async () => true,
        source: "hope_guest_qr_v1"
      }
    );

    if (
      result.accepted === true &&
      result.status === "recorded"
    ) {
      reply(context, 202, "recorded", true);
      return;
    }

    if (
      result.accepted === true &&
      result.status === "already_recorded"
    ) {
      reply(context, 200, "already_recorded", true);
      return;
    }

    if (
      result.status === "invalid" ||
      result.status === "idempotency_conflict"
    ) {
      reply(context, 409, "INVALID_OR_CONFLICTING_SUBMISSION");
      return;
    }

    reply(context, 503, "REGISTRATION_UNAVAILABLE");
  } catch {
    // Never return visitor PII, keys, grant tokens,
    // raw storage errors, or exception text.
    reply(context, 503, "REGISTRATION_UNAVAILABLE");
  }
}