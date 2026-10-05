import {
  SENDGRID_ACCEPTANCE_EVENT_TYPES,
  SENDGRID_DELIVERY_ID_ARGUMENT,
  SENDGRID_DISPATCH_ATTEMPT_ID_ARGUMENT,
  type NormalizeSendGridProviderEventInput,
  type NormalizeSendGridProviderEventResult,
  type SendGridAcceptanceEventType
} from "../../contracts/ministryEmailProviderEvidence.v1";

const MAX_TEXT_LENGTH = 512;

function nonEmptyText(
  value: unknown,
  maxLength = MAX_TEXT_LENGTH
): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= maxLength;
}

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function isAcceptanceEvent(
  value: unknown
): value is SendGridAcceptanceEventType {
  return typeof value === "string" &&
    (
      SENDGRID_ACCEPTANCE_EVENT_TYPES as readonly string[]
    ).includes(value);
}

function normalizeTimestamp(
  value: unknown
): string | null {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return null;
  }

  const milliseconds = value * 1000;

  if (!Number.isSafeInteger(milliseconds)) {
    return null;
  }

  const timestamp = new Date(milliseconds);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

/**
 * Normalizes already-authenticated SendGrid Event Webhook data into the
 * existing recovery evidence contract.
 *
 * This function does not verify signatures, perform network calls, persist
 * evidence, invoke SendGrid, or mutate delivery state.
 *
 * The future webhook boundary must verify the signature against the raw
 * request bytes before setting provenance.signatureVerified=true.
 */
export function normalizeSendGridProviderEvent(
  input: NormalizeSendGridProviderEventInput
): NormalizeSendGridProviderEventResult {
  if (!input.provenance.signatureVerified) {
    return {
      ok: false,
      code: "UNVERIFIED_PROVIDER_EVENT"
    };
  }

  if (
    !nonEmptyText(input.expectedDeliveryId, 256) ||
    !nonEmptyText(input.expectedDispatchAttemptId, 128) ||
    !isObject(input.event)
  ) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    };
  }

  const eventType = input.event.event;

  if (
    typeof eventType === "string" &&
    !isAcceptanceEvent(eventType)
  ) {
    return {
      ok: false,
      code: "UNSUPPORTED_PROVIDER_EVENT"
    };
  }

  if (!isAcceptanceEvent(eventType)) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    };
  }

  const evidenceId = input.event.sg_event_id;
  const providerMessageId = input.event.sg_message_id;
  const deliveryId = input.event[SENDGRID_DELIVERY_ID_ARGUMENT];
  const dispatchAttemptId =
    input.event[SENDGRID_DISPATCH_ATTEMPT_ID_ARGUMENT];

  const observedAt = normalizeTimestamp(
    input.event.timestamp
  );

  if (
    !nonEmptyText(evidenceId, 256) ||
    !nonEmptyText(providerMessageId, 512) ||
    !nonEmptyText(deliveryId, 256) ||
    !nonEmptyText(dispatchAttemptId, 128) ||
    !observedAt
  ) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    };
  }

  if (
    deliveryId !== input.expectedDeliveryId ||
    dispatchAttemptId !== input.expectedDispatchAttemptId
  ) {
    return {
      ok: false,
      code: "PROVIDER_EVENT_CORRELATION_MISMATCH"
    };
  }

  return {
    ok: true,
    eventType,
    evidence: {
      schemaVersion: 1,
      kind: "provider_accepted",
      source: "verified_provider_event",
      deliveryId,
      dispatchAttemptId,
      provider: "sendgrid",
      evidenceId,
      observedAt,
      providerMessageId
    }
  };
}