import {
  RESEND_DELIVERY_EVIDENCE_EVENT_TYPES,
  RESEND_DELIVERY_ID_TAG,
  RESEND_DISPATCH_ATTEMPT_ID_TAG,
  type NormalizeResendProviderEventInput,
  type NormalizeResendProviderEventResult,
  type ResendDeliveryEvidenceEventType
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

function isDeliveryEvidenceEvent(
  value: unknown
): value is ResendDeliveryEvidenceEventType {
  return typeof value === "string" &&
    (
      RESEND_DELIVERY_EVIDENCE_EVENT_TYPES as readonly string[]
    ).includes(value);
}

function normalizeTimestamp(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    value.length > 128
  ) {
    return null;
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return timestamp.toISOString();
}

/**
 * Normalizes already-authenticated Resend webhook data into the canonical
 * provider recovery-evidence contract.
 *
 * The webhook boundary must verify the Svix-compatible signature before
 * setting provenance.signatureVerified=true and must supply the verified
 * svix-id as evidenceId.
 *
 * This function performs no signature verification, provider calls,
 * persistence, recovery mutation, delivery mutation, or email sending.
 */
export function normalizeResendProviderEvent(
  input: NormalizeResendProviderEventInput
): NormalizeResendProviderEventResult {
  if (!input.provenance.signatureVerified) {
    return {
      ok: false,
      code: "UNVERIFIED_PROVIDER_EVENT"
    };
  }

  if (
    !nonEmptyText(input.expectedDeliveryId, 256) ||
    !nonEmptyText(input.expectedDispatchAttemptId, 128) ||
    !nonEmptyText(input.evidenceId, 256) ||
    !isObject(input.event)
  ) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    };
  }

  const eventType = input.event.type;

  if (
    typeof eventType === "string" &&
    !isDeliveryEvidenceEvent(eventType)
  ) {
    return {
      ok: false,
      code: "UNSUPPORTED_PROVIDER_EVENT"
    };
  }

  if (!isDeliveryEvidenceEvent(eventType)) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    };
  }

  const data = input.event.data;

  if (!isObject(data)) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    };
  }

  const tags = data.tags;

  if (!isObject(tags)) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_EVENT"
    };
  }

  const providerMessageId =
    data.email_id;

  const deliveryId =
    tags[RESEND_DELIVERY_ID_TAG];

  const dispatchAttemptId =
    tags[RESEND_DISPATCH_ATTEMPT_ID_TAG];

  const observedAt =
    normalizeTimestamp(
      input.event.created_at
    );

  if (
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
    dispatchAttemptId !==
      input.expectedDispatchAttemptId
  ) {
    return {
      ok: false,
      code:
        "PROVIDER_EVENT_CORRELATION_MISMATCH"
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
      provider: "resend",
      evidenceId: input.evidenceId,
      observedAt,
      providerMessageId
    }
  };
}