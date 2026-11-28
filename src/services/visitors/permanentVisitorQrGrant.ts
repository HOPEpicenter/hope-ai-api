import {
  createHmac,
  randomUUID,
  timingSafeEqual
} from "node:crypto";

import {
  assessPermanentVisitorAdmissionEvent,
  type PermanentVisitorAdmissionPolicy
} from "./assessPermanentVisitorAdmissionEvent";

import type { VisitorEvent } from "./resolveVisitorEventContext";

const PREFIX = "q3";
const PURPOSE = "permanent-visitor-guest-admission";
const MAX_LIFETIME_SECONDS = 3600;
const MAX_TOKEN_LENGTH = 1024;

const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Trusted server-side context only.
 *
 * Policy, approved events, enablement and signing secret
 * must never be accepted from visitor request JSON.
 *
 * Issuance requires separate trusted server authorization.
 * This module does not implement HTTP authentication,
 * capacity reservation, replay protection or persistence.
 */
export type PermanentQrGrantContext = Readonly<{
  enabled?: boolean;
  policy?: PermanentVisitorAdmissionPolicy | null;
  selectedEventId?: unknown;
  approvedEvents: readonly VisitorEvent[];
  nowMs: number;
}>;

export type VerifiedPermanentQrGrant = Readonly<{
  grantId: string;
  serviceId: string;
  date: string;
  expiresAtSeconds: number;
}>;

function validSecret(secret: unknown): secret is string {
  return typeof secret === "string" &&
    Buffer.byteLength(secret, "utf8") >= 32 &&
    Buffer.byteLength(secret, "utf8") <= 512;
}

function signature(value: string, secret: string): Buffer {
  return createHmac("sha256", secret)
    .update(value, "utf8")
    .digest();
}

/**
 * Internal issuer only.
 *
 * A future authenticated server adapter must enforce
 * issuance quotas before calling this function.
 */
export function issuePermanentVisitorQrGrant(
  secret: unknown,
  context: PermanentQrGrantContext,
  lifetimeSeconds = MAX_LIFETIME_SECONDS
): string | null {
  try {
    if (context.enabled !== true ||
        !validSecret(secret) ||
        !Number.isSafeInteger(lifetimeSeconds) ||
        lifetimeSeconds < 1 ||
        lifetimeSeconds > MAX_LIFETIME_SECONDS) {
      return null;
    }

    const activationId = context.policy?.activationId;

    if (typeof activationId !== "string" ||
        !UUID4.test(activationId)) {
      return null;
    }

    const event = assessPermanentVisitorAdmissionEvent(context);

    if (!event.admitted) {
      return null;
    }

    const issued = Math.floor(context.nowMs / 1000);

    // A grant must never outlive its approved event window.
    const expires = Math.min(
      issued + lifetimeSeconds,
      Math.floor(event.closesAtMs / 1000)
    );

    if (expires <= issued) {
      return null;
    }

    const claims = {
      v: 3,
      activation: activationId,
      purpose: PURPOSE,
      event: event.serviceId,
      date: event.date,
      opens: event.opensAtMs,
      closes: event.closesAtMs,
      jti: randomUUID(),
      iat: issued,
      exp: expires
    };

    const payload = Buffer.from(
      JSON.stringify(claims), "utf8"
    ).toString("base64url");

    const signed = `${PREFIX}.${payload}`;

    const token = `${signed}.${
      signature(signed, secret).toString("base64url")
    }`;

    return token.length <= MAX_TOKEN_LENGTH ? token : null;

  } catch {
    return null;
  }
}

/**
 * Internal verifier only.
 *
 * Reassesses current trusted event policy on every use.
 * A verified grant is not a completed registration receipt
 * and does not grant Staff or administrator authority.
 */
export function verifyPermanentVisitorQrGrant(
  token: unknown,
  secret: unknown,
  context: PermanentQrGrantContext
): VerifiedPermanentQrGrant | null {
  try {
    if (context.enabled !== true ||
        !validSecret(secret) ||
        typeof token !== "string" ||
        token.length > MAX_TOKEN_LENGTH) {
      return null;
    }

    const activationId = context.policy?.activationId;

    if (typeof activationId !== "string" ||
        !UUID4.test(activationId)) {
      return null;
    }

    const event = assessPermanentVisitorAdmissionEvent(context);

    if (!event.admitted) {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 3 ||
        parts[0] !== PREFIX ||
        !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
        !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) {
      return null;
    }

    const expected = signature(
      `${PREFIX}.${parts[1]}`, secret
    );

    const supplied = Buffer.from(parts[2], "base64url");

    if (supplied.length !== expected.length ||
        supplied.toString("base64url") !== parts[2] ||
        !timingSafeEqual(supplied, expected)) {
      return null;
    }

    const raw = Buffer.from(parts[1], "base64url");

    if (raw.length > 640 ||
        raw.toString("base64url") !== parts[1]) {
      return null;
    }

    const claims: unknown = JSON.parse(raw.toString("utf8"));

    if (!claims ||
        typeof claims !== "object" ||
        Array.isArray(claims)) {
      return null;
    }

    const data = claims as Record<string, unknown>;

    if (Object.keys(data).sort().join(",") !==
          "activation,closes,date,event,exp,iat,jti,opens,purpose,v" ||
        data.v !== 3 ||
        data.activation !== activationId ||
        data.purpose !== PURPOSE ||
        data.event !== event.serviceId ||
        data.date !== event.date ||
        data.opens !== event.opensAtMs ||
        data.closes !== event.closesAtMs ||
        typeof data.jti !== "string" ||
        !UUID4.test(data.jti) ||
        typeof data.iat !== "number" ||
        typeof data.exp !== "number" ||
        !Number.isSafeInteger(data.iat) ||
        !Number.isSafeInteger(data.exp)) {
      return null;
    }

    const now = Math.floor(context.nowMs / 1000);

    if (data.iat < Math.floor(event.opensAtMs / 1000) ||
        data.iat > now ||
        data.exp <= data.iat ||
        data.exp - data.iat > MAX_LIFETIME_SECONDS ||
        data.exp > Math.floor(event.closesAtMs / 1000) ||
        now >= data.exp) {
      return null;
    }

    return {
      grantId: data.jti,
      serviceId: event.serviceId,
      date: event.date,
      expiresAtSeconds: data.exp
    };

  } catch {
    return null;
  }
}
