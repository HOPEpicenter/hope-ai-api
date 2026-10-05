import {
  EventWebhook
} from "@sendgrid/eventwebhook";
import type {
  VerifySendGridEventWebhookInput,
  VerifySendGridEventWebhookResult
} from "../../contracts/ministryEmailWebhookVerification.v1";

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

/**
 * Pure SendGrid Event Webhook signature verification boundary.
 *
 * The caller must provide the untouched raw request payload. This function
 * performs no JSON parsing, network calls, configuration reads, storage writes,
 * evidence normalization, recovery mutation, or provider invocation.
 */
export function verifySendGridEventWebhook(
  input: VerifySendGridEventWebhookInput
): VerifySendGridEventWebhookResult {
  const normalizedPublicKey =
    typeof input.publicKey === "string"
      ? input.publicKey.trim()
      : "";

  if (
    !hasRawBody(input.rawBody) ||
    !hasText(input.signature, 4096) ||
    !hasText(input.timestamp, 128) ||
    normalizedPublicKey.length === 0 ||
    normalizedPublicKey.length > 8192
  ) {
    return {
      ok: false,
      code: "INVALID_WEBHOOK_VERIFICATION_INPUT"
    };
  }

  const eventWebhook = new EventWebhook();

  let ecPublicKey: unknown;

  try {
    ecPublicKey =
      eventWebhook.convertPublicKeyToECDSA(
        normalizedPublicKey
      );
  } catch {
    return {
      ok: false,
      code: "INVALID_WEBHOOK_PUBLIC_KEY"
    };
  }

  try {
    const verified =
      eventWebhook.verifySignature(
        ecPublicKey as any,
        input.rawBody,
        input.signature,
        input.timestamp
      );

    if (!verified) {
      return {
        ok: false,
        code: "INVALID_WEBHOOK_SIGNATURE"
      };
    }

    return {
      ok: true,
      signatureVerified: true
    };
  } catch {
    return {
      ok: false,
      code: "WEBHOOK_VERIFICATION_FAILED"
    };
  }
}