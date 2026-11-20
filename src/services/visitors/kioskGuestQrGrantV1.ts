import {
  createHmac,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

const EVENT = "friends-family-2026-11-22";
const PURPOSE = "guest-phone-intake";

// November 22, 2026, in America/New_York.
const EVENT_START = Date.parse("2026-11-22T05:00:00Z") / 1000;
const EVENT_END = Date.parse("2026-11-23T05:00:00Z") / 1000;

const MAX_LIFETIME = 6 * 3600;
const CLOCK_SKEW = 30;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type IssueOptions = Readonly<{
  enabled?: boolean;
  ownerAuthorized?: boolean;
}>;

type VerifyOptions = Readonly<{
  enabled?: boolean;
}>;

export type VerifiedGuestQrGrant = Readonly<{
  grantId: string;
  expiresAtSeconds: number;
}>;

function validSecret(secret: unknown): secret is string {
  return (
    typeof secret === "string" &&
    Buffer.byteLength(secret, "utf8") >= 32 &&
    Buffer.byteLength(secret, "utf8") <= 512
  );
}

function validTime(nowMs: number): boolean {
  return Number.isSafeInteger(nowMs) && nowMs >= 0;
}

/**
 * Trusted server-only grant issuer.
 *
 * The caller MUST independently verify the kiosk owner.
 * Never expose this function through an anonymous endpoint.
 * It does not authorize Staff actions or visitor follow-up.
 */
export function issueKioskGuestQrGrantV1(
  secret: string,
  options: IssueOptions = {},
  nowMs: number = Date.now(),
  lifetimeSeconds = 3600
): string | null {
  if (
    options.enabled !== true ||
    options.ownerAuthorized !== true ||
    !validSecret(secret) ||
    !validTime(nowMs) ||
    !Number.isSafeInteger(lifetimeSeconds) ||
    lifetimeSeconds < 1 ||
    lifetimeSeconds > MAX_LIFETIME
  ) {
    return null;
  }

  const now = Math.floor(nowMs / 1000);
  const expires = now + lifetimeSeconds;

  if (
    now < EVENT_START ||
    now >= EVENT_END ||
    expires > EVENT_END
  ) {
    return null;
  }

  const claims = {
    v: 1,
    event: EVENT,
    purpose: PURPOSE,
    jti: randomUUID(),
    iat: now,
    exp: expires
  };

  const payload = Buffer.from(
    JSON.stringify(claims), "utf8"
  ).toString("base64url");

  const signed = `q1.${payload}`;

  const signature = createHmac("sha256", secret)
    .update(signed, "utf8")
    .digest("base64url");

  return `${signed}.${signature}`;
}

/**
 * Guest grant verification is disabled by default.
 *
 * This is only one admission primitive. A future HTTP route
 * must also enforce request limits, global capacity,
 * idempotency and consent validation before persistence.
 *
 * Never treat this grant as an iPad device pass or
 * administrator authorization.
 */
export function verifyKioskGuestQrGrantV1(
  token: unknown,
  secret: string,
  options: VerifyOptions = {},
  nowMs: number = Date.now()
): VerifiedGuestQrGrant | null {
  if (
    options.enabled !== true ||
    !validSecret(secret) ||
    !validTime(nowMs) ||
    typeof token !== "string" ||
    token.length > 1024
  ) {
    return null;
  }

  const now = Math.floor(nowMs / 1000);

  if (now < EVENT_START || now >= EVENT_END) {
    return null;
  }

  const parts = token.split(".");

  if (
    parts.length !== 3 ||
    parts[0] !== "q1" ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2])
  ) {
    return null;
  }

  const signed = `q1.${parts[1]}`;

  const expected = createHmac("sha256", secret)
    .update(signed, "utf8")
    .digest();

  const supplied = Buffer.from(parts[2], "base64url");

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

    const data: unknown = JSON.parse(raw.toString("utf8"));

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return null;
    }

    const claims = data as Record<string, unknown>;

    if (
      Object.keys(claims).sort().join(",") !==
        "event,exp,iat,jti,purpose,v" ||
      claims.v !== 1 ||
      claims.event !== EVENT ||
      claims.purpose !== PURPOSE ||
      typeof claims.jti !== "string" ||
      !UUID4.test(claims.jti) ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp)
    ) {
      return null;
    }

    const issued = claims.iat as number;
    const expires = claims.exp as number;

    if (
      issued < EVENT_START ||
      issued >= EVENT_END ||
      issued > now + CLOCK_SKEW ||
      expires <= issued ||
      expires > EVENT_END ||
      expires - issued > MAX_LIFETIME ||
      now >= expires
    ) {
      return null;
    }

    return {
      grantId: claims.jti,
      expiresAtSeconds: expires
    };
  } catch {
    return null;
  }
}