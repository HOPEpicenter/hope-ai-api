import {
  createHmac,
  timingSafeEqual
} from "node:crypto";

const EVENT = "friends-family-2026-11-22";
const PURPOSE = "kiosk-intake";
const MAX_SECONDS = 7200;
const CLOCK_SKEW_SECONDS = 30;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type VerifiedKioskDevice = Readonly<{
  deviceId: string;
  expiresAtSeconds: number;
}>;

/**
 * Independently verifies the dashboard-issued HMAC pass.
 *
 * Never trust a browser-supplied device ID independently
 * of its verified signature.
 *
 * This verifier is server-only. Its signing secret
 * must never appear in client-side code.
 */
export function verifyKioskDevicePassV1(
  token: unknown,
  secret: string,
  nowMs: number = Date.now()
): VerifiedKioskDevice | null {
  if (
    typeof secret !== "string" ||
    Buffer.byteLength(secret, "utf8") < 32
  ) {
    throw new Error("KIOSK_SIGNING_SECRET_UNAVAILABLE");
  }

  if (
    typeof token !== "string" ||
    token.length > 1024 ||
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0
  ) {
    return null;
  }

  const parts = token.split(".");

  if (
    parts.length !== 3 ||
    parts[0] !== "k1" ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2])
  ) {
    return null;
  }

  const signed = `k1.${parts[1]}`;
  const expected = createHmac(
    "sha256",
    Buffer.from(secret, "utf8")
  ).update(signed, "utf8").digest();

  const supplied = Buffer.from(
    parts[2],
    "base64url"
  );

  if (
    supplied.length !== expected.length ||
    supplied.toString("base64url") !== parts[2] ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const raw = Buffer.from(parts[1], "base64url");

    if (
      raw.length > 512 ||
      raw.toString("base64url") !== parts[1]
    ) {
      return null;
    }

    const claims: unknown = JSON.parse(
      raw.toString("utf8")
    );

    if (
      !claims ||
      typeof claims !== "object" ||
      Array.isArray(claims)
    ) {
      return null;
    }

    const data = claims as Record<string, unknown>;

    if (
      Object.keys(data).length !== 6 ||
      data.v !== 1 ||
      data.event !== EVENT ||
      data.purpose !== PURPOSE ||
      typeof data.jti !== "string" ||
      !UUID4.test(data.jti) ||
      typeof data.iat !== "number" ||
      typeof data.exp !== "number" ||
      !Number.isSafeInteger(data.iat) ||
      !Number.isSafeInteger(data.exp)
    ) {
      return null;
    }

    const issued = data.iat as number;
    const expires = data.exp as number;
    const now = Math.floor(nowMs / 1000);

    if (
      issued < 0 ||
      issued > now + CLOCK_SKEW_SECONDS ||
      expires <= issued ||
      expires - issued > MAX_SECONDS ||
      now >= expires
    ) {
      return null;
    }

    return {
      deviceId: data.jti,
      expiresAtSeconds: expires
    };
  } catch {
    return null;
  }
}