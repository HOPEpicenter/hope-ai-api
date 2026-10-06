import { createHash } from "node:crypto";
import type {
  MinistryEmailDispatchRecoveryAuditV1,
  MinistryEmailDispatchRecoveryEvidence,
  ResolveMinistryEmailDispatchRecoveryInputV1,
  ResolveMinistryEmailDispatchRecoveryResultV1
} from "../../contracts/ministryEmailDispatchRecovery.v1";
import {
  isMinistryEmailDeliveryProvider
} from "../../domain/communications/ministryEmailDeliveryContracts";
import type {
  MinistryEmailDeliveryRecord
} from "../../domain/communications/ministryEmailDeliveryContracts";
import {
  AzureMinistryEmailDispatchRecoveryRepository,
  type MinistryEmailDispatchRecoveryRepository
} from "../../repositories/ministryEmailDispatchRecoveryRepository";
import type {
  MinistryEmailProviderResult
} from "./ministryEmailDeliveryProvider";
import {
  MinistryEmailDeliveryTransitionError,
  transitionMinistryEmailDeliveryProviderResult
} from "./transitionMinistryEmailDeliveryProviderResult";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_FAILURE = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function isIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString() === value;
}

function text(value: unknown, max = 256): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value.length <= max;
}

function evidenceFingerprint(
  evidence: MinistryEmailDispatchRecoveryEvidence
): string {
  const canonical = evidence.kind === "provider_accepted"
    ? {
        schemaVersion: evidence.schemaVersion,
        kind: evidence.kind,
        source: evidence.source,
        deliveryId: evidence.deliveryId,
        dispatchAttemptId: evidence.dispatchAttemptId,
        provider: evidence.provider,
        evidenceId: evidence.evidenceId,
        observedAt: evidence.observedAt,
        providerMessageId: evidence.providerMessageId
      }
    : {
        schemaVersion: evidence.schemaVersion,
        kind: evidence.kind,
        source: evidence.source,
        deliveryId: evidence.deliveryId,
        dispatchAttemptId: evidence.dispatchAttemptId,
        provider: evidence.provider,
        evidenceId: evidence.evidenceId,
        observedAt: evidence.observedAt,
        failureCode: evidence.failureCode
      };

  return createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}

function validate(
  input: ResolveMinistryEmailDispatchRecoveryInputV1
): boolean {
  if (
    !SAFE_ID.test(input.resolutionId ?? "") ||
    !text(input.deliveryId, 256) ||
    !SAFE_ID.test(input.dispatchAttemptId ?? "") ||
    !text(input.actorId, 256) ||
    !isIso(input.resolvedAt)
  ) {
    return false;
  }

  const evidence = input.evidence;

  if (
    !evidence ||
    evidence.schemaVersion !== 1 ||
    !isMinistryEmailDeliveryProvider(
      evidence.provider
    ) ||
    evidence.deliveryId !== input.deliveryId ||
    evidence.dispatchAttemptId !== input.dispatchAttemptId ||
    !text(evidence.evidenceId, 256) ||
    !isIso(evidence.observedAt)
  ) {
    return false;
  }

  if (evidence.kind === "provider_accepted") {
    return (
      evidence.source === "captured_send_response" ||
      evidence.source === "verified_provider_event" ||
      evidence.source === "verified_provider_activity"
    ) &&
      text(evidence.providerMessageId, 256);
  }

  return evidence.kind === "provider_rejected" &&
    evidence.source === "captured_send_response" &&
    SAFE_FAILURE.test(evidence.failureCode ?? "");
}

function resultFromEvidence(
  evidence: MinistryEmailDispatchRecoveryEvidence
): MinistryEmailProviderResult {
  if (evidence.kind === "provider_accepted") {
    return {
      accepted: true,
      provider: evidence.provider,
      providerMessageId: evidence.providerMessageId
    };
  }

  return {
    accepted: false,
    provider: evidence.provider,
    failureCode: evidence.failureCode
  };
}

function auditFrom(
  input: ResolveMinistryEmailDispatchRecoveryInputV1
): MinistryEmailDispatchRecoveryAuditV1 {
  const evidence = input.evidence;

  return {
    schemaVersion: 1,
    resolutionId: input.resolutionId,
    deliveryId: input.deliveryId,
    dispatchAttemptId: input.dispatchAttemptId,
    actorId: input.actorId,
    resolvedAt: input.resolvedAt,
    provider: evidence.provider,
    decision: evidence.kind === "provider_accepted"
      ? "provider_accepted"
      : "failed",
    evidenceKind: evidence.kind,
    evidenceSource: evidence.source,
    evidenceId: evidence.evidenceId,
    evidenceObservedAt: evidence.observedAt,
    evidenceFingerprint: evidenceFingerprint(evidence),
    providerMessageId: evidence.kind === "provider_accepted"
      ? evidence.providerMessageId
      : null,
    failureCode: evidence.kind === "provider_rejected"
      ? evidence.failureCode
      : null
  };
}

function sameAudit(
  left: MinistryEmailDispatchRecoveryAuditV1,
  right: MinistryEmailDispatchRecoveryAuditV1
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function terminalMatchesAudit(
  record: MinistryEmailDeliveryRecord,
  audit: MinistryEmailDispatchRecoveryAuditV1
): boolean {
  if (record.dispatchAttemptId !== audit.dispatchAttemptId) {
    return false;
  }

  if (audit.decision === "provider_accepted") {
    return record.state === "provider_accepted" &&
      record.provider === audit.provider &&
      record.providerMessageId === audit.providerMessageId &&
      record.providerAcceptedAt === audit.evidenceObservedAt &&
      record.failedAt === null &&
      record.failureCode === null;
  }

  return record.state === "failed" &&
    record.provider === audit.provider &&
    record.providerMessageId === null &&
    record.providerAcceptedAt === null &&
    record.failedAt === audit.evidenceObservedAt &&
    record.failureCode === audit.failureCode;
}

async function reconcile(
  repository: MinistryEmailDispatchRecoveryRepository,
  input: ResolveMinistryEmailDispatchRecoveryInputV1,
  expectedAudit: MinistryEmailDispatchRecoveryAuditV1,
  uncertain: boolean
): Promise<ResolveMinistryEmailDispatchRecoveryResultV1> {
  const [audit, delivery] = await Promise.all([
    repository.readRecovery(input.deliveryId, input.resolutionId),
    repository.readDeliveryVersioned(input.deliveryId)
  ]);

  if (audit) {
    if (!sameAudit(audit, expectedAudit)) {
      return { ok: false, code: "RECOVERY_REPLAY_CONFLICT" };
    }

    if (
      delivery &&
      terminalMatchesAudit(delivery.record, expectedAudit)
    ) {
      return {
        ok: true,
        status: "replayed",
        audit
      };
    }

    return {
      ok: false,
      code: "RECOVERY_STORAGE_INVARIANT_VIOLATION"
    };
  }

  if (!delivery) {
    return {
      ok: false,
      code: uncertain
        ? "RECOVERY_PERSISTENCE_UNCERTAIN"
        : "DELIVERY_NOT_FOUND"
    };
  }

  if (
    delivery.record.state === "provider_accepted" ||
    delivery.record.state === "failed"
  ) {
    return {
      ok: false,
      code: "RECOVERY_TRANSITION_CONFLICT"
    };
  }

  return {
    ok: false,
    code: uncertain
      ? "RECOVERY_PERSISTENCE_UNCERTAIN"
      : "RECOVERY_TRANSITION_CONFLICT"
  };
}

/**
 * Internal recovery foundation only.
 *
 * The caller must supply a canonical already-authorized actorId. This service
 * performs no provider calls and cannot authorize a resend.
 */
export async function resolveMinistryEmailDispatchRecovery(
  input: ResolveMinistryEmailDispatchRecoveryInputV1,
  repository: MinistryEmailDispatchRecoveryRepository =
    new AzureMinistryEmailDispatchRecoveryRepository()
): Promise<ResolveMinistryEmailDispatchRecoveryResultV1> {
  if (!validate(input)) {
    return { ok: false, code: "INVALID_RECOVERY_INPUT" };
  }

  const expectedAudit = auditFrom(input);

  let prior: MinistryEmailDispatchRecoveryAuditV1 | null;

  try {
    prior = await repository.readRecovery(
      input.deliveryId,
      input.resolutionId
    );
  } catch {
    return {
      ok: false,
      code: "RECOVERY_PERSISTENCE_UNCERTAIN"
    };
  }

  if (prior) {
    if (!sameAudit(prior, expectedAudit)) {
      return { ok: false, code: "RECOVERY_REPLAY_CONFLICT" };
    }

    let current;
    try {
      current = await repository.readDeliveryVersioned(input.deliveryId);
    } catch {
      return {
        ok: false,
        code: "RECOVERY_PERSISTENCE_UNCERTAIN"
      };
    }

    if (
      current &&
      terminalMatchesAudit(current.record, expectedAudit)
    ) {
      return {
        ok: true,
        status: "replayed",
        audit: prior
      };
    }

    return {
      ok: false,
      code: "RECOVERY_STORAGE_INVARIANT_VIOLATION"
    };
  }

  let versioned;

  try {
    versioned = await repository.readDeliveryVersioned(input.deliveryId);
  } catch {
    return {
      ok: false,
      code: "RECOVERY_PERSISTENCE_UNCERTAIN"
    };
  }

  if (!versioned) {
    return { ok: false, code: "DELIVERY_NOT_FOUND" };
  }

  if (versioned.record.state !== "dispatching") {
    return {
      ok: false,
      code: "DELIVERY_NOT_DISPATCHING"
    };
  }

  if (
    versioned.record.dispatchAttemptId !== input.dispatchAttemptId
  ) {
    return {
      ok: false,
      code: "DISPATCH_ATTEMPT_MISMATCH"
    };
  }

  let nextRecord: MinistryEmailDeliveryRecord;

  try {
    nextRecord = transitionMinistryEmailDeliveryProviderResult(
      versioned.record,
      resultFromEvidence(input.evidence),
      input.evidence.observedAt
    );
  } catch (error) {
    if (error instanceof MinistryEmailDeliveryTransitionError) {
      return {
        ok: false,
        code: "RECOVERY_TRANSITION_CONFLICT"
      };
    }

    throw error;
  }

  try {
    const committed = await repository.resolveIfVersion(
      nextRecord,
      expectedAudit,
      versioned.version
    );

    if (committed) {
      return {
        ok: true,
        status: "resolved",
        audit: expectedAudit
      };
    }

    return reconcile(
      repository,
      input,
      expectedAudit,
      false
    );
  } catch {
    try {
      return await reconcile(
        repository,
        input,
        expectedAudit,
        true
      );
    } catch {
      return {
        ok: false,
        code: "RECOVERY_PERSISTENCE_UNCERTAIN"
      };
    }
  }
}