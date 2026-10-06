import {
  createHash
} from "node:crypto";
import {
  RESEND_DELIVERY_EVIDENCE_EVENT_TYPES,
  SENDGRID_ACCEPTANCE_EVENT_TYPES
} from "../../contracts/ministryEmailProviderEvidence.v1";
import {
  isMinistryEmailDeliveryProvider
} from "../../domain/communications/ministryEmailDeliveryContracts";
import type {
  PersistMinistryEmailProviderEvidenceInputV1,
  PersistMinistryEmailProviderEvidenceResultV1,
  PersistedMinistryEmailProviderEvidenceV1
} from "../../contracts/ministryEmailProviderEvidencePersistence.v1";
import {
  AzureMinistryEmailProviderEvidenceRepository,
  type MinistryEmailProviderEvidenceRepository
} from "../../repositories/ministryEmailProviderEvidenceRepository";

function text(
  value: unknown,
  maxLength: number
): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= maxLength;
}

function isIso(
  value: unknown
): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const parsed = new Date(value);

  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString() === value;
}

function fingerprint(
  input: PersistMinistryEmailProviderEvidenceInputV1
): string {
  const evidence = input.evidence;

  const canonical = {
    schemaVersion: 1,
    provider: evidence.provider,
    evidenceId: evidence.evidenceId,
    deliveryId: evidence.deliveryId,
    dispatchAttemptId:
      evidence.dispatchAttemptId,
    kind: evidence.kind,
    source: evidence.source,
    observedAt: evidence.observedAt,
    providerMessageId:
      evidence.providerMessageId,
    eventType: input.eventType
  };

  return createHash("sha256")
    .update(
      JSON.stringify(canonical),
      "utf8"
    )
    .digest("hex");
}

function buildRecord(
  input: PersistMinistryEmailProviderEvidenceInputV1
): PersistedMinistryEmailProviderEvidenceV1 {
  const evidence = input.evidence;

  return {
    schemaVersion: 1,
    provider: evidence.provider,
    evidenceId: evidence.evidenceId,
    deliveryId: evidence.deliveryId,
    dispatchAttemptId:
      evidence.dispatchAttemptId,
    kind: "provider_accepted",
    source: "verified_provider_event",
    observedAt: evidence.observedAt,
    providerMessageId:
      evidence.providerMessageId,
    eventType: input.eventType,
    evidenceFingerprint:
      fingerprint(input)
  };
}

function valid(
  input: PersistMinistryEmailProviderEvidenceInputV1
): boolean {
  const evidence = input?.evidence;

  if (
    !evidence ||
    evidence.schemaVersion !== 1 ||
    !isMinistryEmailDeliveryProvider(
      evidence.provider
    ) ||
    evidence.kind !== "provider_accepted" ||
    evidence.source !==
      "verified_provider_event" ||
    !text(evidence.evidenceId, 256) ||
    !text(evidence.deliveryId, 256) ||
    !text(evidence.dispatchAttemptId, 128) ||
    !text(evidence.providerMessageId, 512) ||
    !text(input.eventType, 128) ||
    !isIso(evidence.observedAt)
  ) {
    return false;
  }

  if (evidence.provider === "sendgrid") {
    return (
      SENDGRID_ACCEPTANCE_EVENT_TYPES as readonly string[]
    ).includes(input.eventType);
  }

  if (evidence.provider === "resend") {
    return (
      RESEND_DELIVERY_EVIDENCE_EVENT_TYPES as readonly string[]
    ).includes(input.eventType);
  }

  return false;
}

function sameRecord(
  left: PersistedMinistryEmailProviderEvidenceV1,
  right: PersistedMinistryEmailProviderEvidenceV1
): boolean {
  return left.schemaVersion === right.schemaVersion &&
    left.provider === right.provider &&
    left.evidenceId === right.evidenceId &&
    left.deliveryId === right.deliveryId &&
    left.dispatchAttemptId ===
      right.dispatchAttemptId &&
    left.kind === right.kind &&
    left.source === right.source &&
    left.observedAt === right.observedAt &&
    left.providerMessageId ===
      right.providerMessageId &&
    left.eventType === right.eventType &&
    left.evidenceFingerprint ===
      right.evidenceFingerprint;
}

async function reread(
  repository: MinistryEmailProviderEvidenceRepository,
  expected: PersistedMinistryEmailProviderEvidenceV1
): Promise<PersistMinistryEmailProviderEvidenceResultV1> {
  let stored:
    PersistedMinistryEmailProviderEvidenceV1 |
    null;

  try {
    stored = await repository.read(
      expected.provider,
      expected.evidenceId
    );
  } catch {
    return {
      ok: false,
      code:
        "PROVIDER_EVIDENCE_PERSISTENCE_UNCERTAIN"
    };
  }

  if (!stored) {
    return {
      ok: false,
      code:
        "PROVIDER_EVIDENCE_PERSISTENCE_UNCERTAIN"
    };
  }

  if (!sameRecord(stored, expected)) {
    return {
      ok: false,
      code:
        "PROVIDER_EVIDENCE_REPLAY_CONFLICT"
    };
  }

  return {
    ok: true,
    status: "replayed",
    record: stored
  };
}

/**
 * Persists already-normalized, already-authenticated provider evidence.
 *
 * This service performs no provider calls, delivery mutation, recovery
 * resolution, resend, retry, reclaim, or ministry-state mutation.
 */
export async function persistMinistryEmailProviderEvidence(
  input: PersistMinistryEmailProviderEvidenceInputV1,
  repository:
    MinistryEmailProviderEvidenceRepository =
      new AzureMinistryEmailProviderEvidenceRepository()
): Promise<PersistMinistryEmailProviderEvidenceResultV1> {
  if (!valid(input)) {
    return {
      ok: false,
      code: "INVALID_PROVIDER_EVIDENCE"
    };
  }

  const expected = buildRecord(input);

  let prior:
    PersistedMinistryEmailProviderEvidenceV1 |
    null;

  try {
    prior = await repository.read(
      expected.provider,
      expected.evidenceId
    );
  } catch {
    return {
      ok: false,
      code:
        "PROVIDER_EVIDENCE_PERSISTENCE_UNCERTAIN"
    };
  }

  if (prior) {
    if (!sameRecord(prior, expected)) {
      return {
        ok: false,
        code:
          "PROVIDER_EVIDENCE_REPLAY_CONFLICT"
      };
    }

    return {
      ok: true,
      status: "replayed",
      record: prior
    };
  }

  try {
    const created =
      await repository.create(expected);

    if (created) {
      return {
        ok: true,
        status: "persisted",
        record: expected
      };
    }

    return reread(
      repository,
      expected
    );
  } catch {
    return reread(
      repository,
      expected
    );
  }
}