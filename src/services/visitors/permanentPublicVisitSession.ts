import {
  createHmac,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import {
  resolvePermanentPublicVisitEvent,
  type PermanentPublicVisitContext
} from "./resolvePermanentPublicVisitEvent";

/**
 * Automatic public registration session.
 *
 * Both personal smartphones and shared church tablets
 * use exactly the same session mechanism.
 *
 * No owner activation, device identity or device pairing.
 * The trusted backend controls configuration and time.
 *
 * HTTP issuance, durable reservation and rate limiting
 * must be integrated before public release.
 */

const PREFIX = "p1";
const PURPOSE = "hope-permanent-public-visit";
const LIFETIME_SECONDS = 600;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type VerifiedPermanentPublicVisitSession =
  Readonly<{
    grantId: string;
    serviceId: string;
    date: string;
    expiresAtSeconds: number;
  }>;

function validSecret(
  secret: unknown
): secret is string {
  return typeof secret === "string" &&
    secret.length >= 32 &&
    secret.length <= 512 &&
    secret.trim() === secret &&
    !/[\u0000-\u001f\u007f]/.test(secret);
}

function decodeCanonical(
  value: string
): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");

  return decoded.toString("base64url") === value
    ? decoded
    : null;
}

function sign(
  input: string,
  secret: string
): Buffer {
  return createHmac("sha256", secret)
    .update(input, "utf8")
    .digest();
}

export function issuePermanentPublicVisitSession(
  secret: unknown,
  context: PermanentPublicVisitContext
): string | null {
  if (!validSecret(secret)) {
    return null;
  }

  try {
    const event =
      resolvePermanentPublicVisitEvent(context);

    if (event.status !== "ready") {
      return null;
    }

    const issuedAt =
      Math.floor(context.nowMs / 1000);

    const claims = {
      v: 1,
      purpose: PURPOSE,
      jti: randomUUID(),
      event: event.serviceId,
      date: event.date,
      iat: issuedAt,
      exp: issuedAt + LIFETIME_SECONDS
    };

    const payload = Buffer.from(
      JSON.stringify(claims),
      "utf8"
    ).toString("base64url");

    const signed = `${PREFIX}.${payload}`;

    const token = `${signed}.` +
      sign(signed, secret).toString("base64url");

    return token.length <= 4096 ? token : null;
  } catch {
    return null;
  }
}

export function verifyPermanentPublicVisitSession(
  token: unknown,
  secret: unknown,
  context: PermanentPublicVisitContext
): VerifiedPermanentPublicVisitSession | null {
  if (!validSecret(secret) ||
      typeof token !== "string" ||
      token.length > 4096) {
    return null;
  }

  try {
    const event =
      resolvePermanentPublicVisitEvent(context);

    if (event.status !== "ready") {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 3 ||
        parts[0] !== PREFIX) {
      return null;
    }

    const payload = decodeCanonical(parts[1]);
    const signature = decodeCanonical(parts[2]);

    if (!payload || !signature) {
      return null;
    }

    const expected = sign(
      `${parts[0]}.${parts[1]}`,
      secret
    );

    if (signature.length !== expected.length ||
        !timingSafeEqual(signature, expected)) {
      return null;
    }

    const decoded: unknown = JSON.parse(
      new TextDecoder("utf-8", {
        fatal: true
      }).decode(payload)
    );

    if (!decoded ||
        typeof decoded !== "object" ||
        Array.isArray(decoded)) {
      return null;
    }

    const claims =
      decoded as Record<string, unknown>;

    if (Object.keys(claims).sort().join(",") !==
        "date,event,exp,iat,jti,purpose,v") {
      return null;
    }

    if (claims.v !== 1 ||
        claims.purpose !== PURPOSE ||
        typeof claims.jti !== "string" ||
        !UUID4.test(claims.jti) ||
        claims.event !== event.serviceId ||
        claims.date !== event.date ||
        typeof claims.iat !== "number" ||
        typeof claims.exp !== "number" ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp)) {
      return null;
    }

    const now =
      Math.floor(context.nowMs / 1000);

    if (claims.iat > now ||
        claims.exp <= now ||
        claims.exp - claims.iat !==
          LIFETIME_SECONDS) {
      return null;
    }

    return {
      grantId: claims.jti,
      serviceId: event.serviceId,
      date: event.date,
      expiresAtSeconds: claims.exp
    };
  } catch {
    return null;
  }
}
