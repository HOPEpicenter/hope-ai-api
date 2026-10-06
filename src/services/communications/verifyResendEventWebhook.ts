import {
  createHmac,
  timingSafeEqual
} from "node:crypto";
import type {
  VerifyResendEventWebhookInput,
  VerifyResendEventWebhookResult
} from "../../contracts/ministryEmailWebhookVerification.v1";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

function hasText(
  value: unknown,
  maxLength: number
): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= maxLength;
}

function hasRawBody(
  value: unknown
): value is Buffer | string {
  if (Buffer.isBuffer(value)) {
    return value.length > 0;
  }

  return typeof value === "string" &&
    value.length > 0;
}

function parseTimestamp(
  value: string
): number | null {
  if (!/^\d{1,16}$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

function decodeSigningSecret(
  value: string
): Buffer | null {
  if (
    !value.startsWith("whsec_") ||
    value.length <= "whsec_".length
  ) {
    return null;
  }

  try {
    const decoded = Buffer.from(
      value.slice("whsec_".length),
      "base64"
    );

    return decoded.length > 0
      ? decoded
      : null;
  } catch {
    return null;
  }
}

function signatureCandidates(
  value: string
): string[] {
  return value
    .split(/\s+/)
    .map(candidate => candidate.trim())
    .filter(Boolean)
    .flatMap(candidate => {
      const comma = candidate.indexOf(",");

      if (comma <= 0) {
        return [];
      }

      const version =
        candidate.slice(0, comma);

      const signature =
        candidate.slice(comma + 1);

      return version === "v1" &&
        signature.length > 0
        ? [signature]
        : [];
    });
}

/**
 * Verifies a Resend webhook using its Svix-compatible signature envelope.
 *
 * The exact raw request payload must be supplied unchanged. This function
 * performs no JSON parsing, provider calls, configuration reads, persistence,
 * delivery mutation, recovery mutation, or email sending.
 */
export function verifyResendEventWebhook(
  input: VerifyResendEventWebhookInput,
  nowEpochSeconds: number =
    Math.floor(Date.now() / 1000)
): VerifyResendEventWebhookResult {
  if (
    !hasRawBody(input?.rawBody) ||
    !hasText(input?.messageId, 512) ||
    !hasText(input?.timestamp, 128) ||
    !hasText(input?.signature, 8192) ||
    !hasText(input?.signingSecret, 8192) ||
    !Number.isSafeInteger(nowEpochSeconds) ||
    nowEpochSeconds <= 0
  ) {
    return {
      ok: false,
      code: "INVALID_WEBHOOK_VERIFICATION_INPUT"
    };
  }

  const timestamp =
    parseTimestamp(input.timestamp);

  if (timestamp === null) {
    return {
      ok: false,
      code: "INVALID_WEBHOOK_TIMESTAMP"
    };
  }

  if (
    Math.abs(nowEpochSeconds - timestamp) >
      WEBHOOK_TOLERANCE_SECONDS
  ) {
    return {
      ok: false,
      code: "INVALID_WEBHOOK_TIMESTAMP"
    };
  }

  const signingKey =
    decodeSigningSecret(
      input.signingSecret
    );

  if (!signingKey) {
    return {
      ok: false,
      code: "INVALID_WEBHOOK_SIGNING_SECRET"
    };
  }

  const rawBody =
    Buffer.isBuffer(input.rawBody)
      ? input.rawBody
      : Buffer.from(input.rawBody, "utf8");

  const signedPayload =
    Buffer.concat([
      Buffer.from(
        `${input.messageId}.${input.timestamp}.`,
        "utf8"
      ),
      rawBody
    ]);

  let expected: Buffer;

  try {
    expected = createHmac(
      "sha256",
      signingKey
    )
      .update(signedPayload)
      .digest();
  } catch {
    return {
      ok: false,
      code: "WEBHOOK_VERIFICATION_FAILED"
    };
  }

  const candidates =
    signatureCandidates(
      input.signature
    );

  for (const candidate of candidates) {
    let actual: Buffer;

    try {
      actual = Buffer.from(
        candidate,
        "base64"
      );
    } catch {
      continue;
    }

    if (
      actual.length === expected.length &&
      timingSafeEqual(actual, expected)
    ) {
      return {
        ok: true,
        signatureVerified: true
      };
    }
  }

  return {
    ok: false,
    code: "INVALID_WEBHOOK_SIGNATURE"
  };
}