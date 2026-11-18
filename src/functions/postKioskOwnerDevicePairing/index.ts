import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import { authorizeKioskOwnerPairing } from
  "../../services/authorization/authorizeKioskOwnerPairing";
import { registerKioskDeviceV1 } from
  "../../services/visitors/kioskDeviceRegistryV1";

const SITE = "hope-kiosk-acceptance-api";
const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_BODY_BYTES = 256;

type Dependencies = {
  authorize?: typeof authorizeKioskOwnerPairing;
  register?: typeof registerKioskDeviceV1;
};

function readHeader(req: any, name: string): string {
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
  code: string
): void {
  context.res = {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    },
    body: {
      ok: status === 201,
      status: code
    }
  };
}

function authorityKeyValid(req: any): boolean {
  const expected =
    process.env.HOPE_KIOSK_DEVICE_AUTHORITY_KEY ?? "";
  const supplied = readHeader(
    req, "x-kiosk-device-authority-key"
  );

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(supplied, "utf8");

  return (
    a.length >= 32 &&
    a.length <= 256 &&
    b.length === a.length &&
    timingSafeEqual(a, b)
  );
}

/**
 * Isolated kiosk owner-specific device registration.
 *
 * API key + independent authority key + verified owner
 * access token are mandatory. None is sufficient alone.
 *
 * This endpoint does not issue signed browser passes,
 * create Staff identities, or authorize other operations.
 */
export async function postKioskOwnerDevicePairing(
  context: any,
  req: any,
  deps: Dependencies = {}
): Promise<void> {
  if (
    process.env.WEBSITE_SITE_NAME !== SITE ||
    process.env.FEATURE_KIOSK_OWNER_PAIRING !== "true" ||
    process.env.HOPE_KIOSK_DEVICE_AUTHORITY_ENABLED !== "true"
  ) {
    reply(context, 404, "NOT_AVAILABLE");
    return;
  }

  const apiKey = requireApiKeyForFunction(req);

  if (!apiKey.ok || !authorityKeyValid(req)) {
    reply(context, 403, "NOT_AUTHORIZED");
    return;
  }

  const authorization = readHeader(req, "authorization");
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);

  if (!match) {
    reply(context, 401, "TOKEN_REQUIRED");
    return;
  }

  const contentType = readHeader(req, "content-type");

  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      contentType
    )
  ) {
    reply(context, 415, "UNSUPPORTED_MEDIA_TYPE");
    return;
  }

  const body = req?.body;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).sort().join(",") !==
      "deviceId,expiresAtSeconds" ||
    typeof body.deviceId !== "string" ||
    !UUID4.test(body.deviceId) ||
    !Number.isSafeInteger(body.expiresAtSeconds)
  ) {
    reply(context, 400, "INVALID_REQUEST");
    return;
  }

  const raw = req?.rawBody;
  const length =
    typeof raw === "string" || Buffer.isBuffer(raw)
      ? Buffer.byteLength(raw)
      : Buffer.byteLength(JSON.stringify(body));

  if (length > MAX_BODY_BYTES) {
    reply(context, 413, "REQUEST_TOO_LARGE");
    return;
  }

  try {
    const authorize =
      deps.authorize ?? authorizeKioskOwnerPairing;

    const decision = await authorize(match[1]);

    if (
      decision.authorized !== true ||
      decision.staffAuthorityGranted !== false ||
      decision.staffCreationPermitted !== false
    ) {
      reply(context, 403, "NOT_AUTHORIZED");
      return;
    }

    const register =
      deps.register ?? registerKioskDeviceV1;

    await register(
      body.deviceId,
      body.expiresAtSeconds,
      { enabled: true }
    );

    reply(context, 201, "registered");
  } catch {
    reply(context, 503, "PAIRING_UNAVAILABLE");
  }
}