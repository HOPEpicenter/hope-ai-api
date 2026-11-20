import { Buffer } from "node:buffer";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  issueKioskGuestQrGrantV1
} from "../../services/visitors/kioskGuestQrGrantV1";
import {
  reserveKioskGuestQrSlotV1
} from "../../services/visitors/reserveKioskGuestQrSlotV1";

const SITE = "hope-kiosk-acceptance-api";
const START = Date.parse("2026-11-22T05:00:00Z");
const END = Date.parse("2026-11-23T05:00:00Z");
const LIFETIME_SECONDS = 3600;

// Fixed, non-visitor issuance bucket.
// It is separate from all randomly issued guest grant IDs.
const ISSUANCE_BUCKET =
  "ffffffff-ffff-4fff-8fff-ffffffffffff";

type Dependencies = {
  nowMs?: () => number;
  reserveIssue?: typeof reserveKioskGuestQrSlotV1;
  issue?: typeof issueKioskGuestQrGrantV1;
};

function header(req: any, name: string): string {
  const value =
    (typeof req?.headers?.get === "function"
      ? req.headers.get(name)
      : undefined) ??
    req?.headers?.[name];

  return typeof value === "string" ? value.trim() : "";
}

function respond(
  context: any,
  status: number,
  body: Record<string, unknown>
): void {
  context.res = {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer"
    },
    body
  };
}

function deny(
  context: any,
  status: number,
  code: string
): void {
  respond(context, status, {
    ok: false,
    error: code
  });
}

/**
 * Private server-to-server guest session issuance.
 *
 * Called only by the trusted kiosk frontend server,
 * which retains the API key and sets an HttpOnly cookie.
 *
 * The owner must explicitly activate this isolated
 * feature through trusted server configuration.
 *
 * Never forward the grant in public JSON, HTML,
 * URLs, logs or browser-accessible storage.
 *
 * This endpoint grants no Staff authority.
 */
export async function postKioskGuestQrSession(
  context: any,
  req: any,
  dependencies: Dependencies = {}
): Promise<void> {
  if (
    process.env.WEBSITE_SITE_NAME !== SITE ||
    process.env.HOPE_KIOSK_GUEST_QR_SESSION_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_GUEST_QR_OWNER_ACTIVATED !== "true" ||
    process.env.HOPE_KIOSK_GUEST_QR_INGRESS_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_GUEST_QR_RATE_LIMIT_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_BACKEND_INGRESS_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED !== "true" ||
    process.env.HOPE_KIOSK_CAPACITY_GUARD_ENABLED !== "true"
  ) {
    deny(context, 404, "NOT_AVAILABLE");
    return;
  }

  const apiKey = requireApiKeyForFunction(req);

  if (!apiKey.ok) {
    deny(
      context,
      apiKey.status === 500 ? 503 : 401,
      "NOT_AUTHORIZED"
    );
    return;
  }

  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      header(req, "content-type")
    )
  ) {
    deny(context, 415, "UNSUPPORTED_MEDIA_TYPE");
    return;
  }

  const body = req?.body;
  const raw = req?.rawBody;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    body.intent !== "start-guest-phone-registration"
  ) {
    deny(context, 400, "INVALID_REQUEST");
    return;
  }

  const bytes =
    typeof raw === "string" || Buffer.isBuffer(raw)
      ? Buffer.byteLength(raw)
      : Buffer.byteLength(JSON.stringify(body));

  if (bytes > 128) {
    deny(context, 413, "REQUEST_TOO_LARGE");
    return;
  }

  const nowMs = (
    dependencies.nowMs ?? (() => Date.now())
  )();

  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs < START ||
    nowMs >= END
  ) {
    deny(context, 404, "NOT_AVAILABLE");
    return;
  }

  try {
    // Shared atomic issuance quota: 30 new sessions
    // per minute, across backend instances.
    const reserve = dependencies.reserveIssue ??
      reserveKioskGuestQrSlotV1;

    const slot = await reserve(
      ISSUANCE_BUCKET,
      {
        enabled: true,
        now: new Date(nowMs),
        capacity: 30
      }
    );

    if (!slot.admitted) {
      deny(context, 429, "SESSION_LIMIT_REACHED");
      return;
    }

    const issue = dependencies.issue ??
      issueKioskGuestQrGrantV1;

    const grant = issue(
      process.env.HOPE_KIOSK_GUEST_QR_SIGNING_SECRET ?? "",
      {
        enabled: true,
        // Owner activation was checked above.
        ownerAuthorized: true
      },
      nowMs,
      LIFETIME_SECONDS
    );

    if (!grant) {
      deny(context, 503, "SESSION_UNAVAILABLE");
      return;
    }

    // Credential is exclusively for the trusted
    // server-to-server caller. Never relay it publicly.
    respond(context, 201, {
      ok: true,
      grant,
      expiresInSeconds: LIFETIME_SECONDS
    });
  } catch {
    deny(context, 503, "SESSION_UNAVAILABLE");
  }
}