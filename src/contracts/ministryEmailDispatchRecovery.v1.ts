import type {
  MinistryEmailDeliveryProvider,
  MinistryEmailDeliveryState
} from "../domain/communications/ministryEmailDeliveryContracts";

export const MINISTRY_EMAIL_DISPATCH_RECOVERY_SCHEMA_VERSION = 1 as const;

export type MinistryEmailDispatchRecoveryEvidenceSource =
  | "captured_send_response"
  | "verified_provider_event"
  | "verified_provider_activity";

type MinistryEmailDispatchRecoveryEvidenceBase = {
  schemaVersion: typeof MINISTRY_EMAIL_DISPATCH_RECOVERY_SCHEMA_VERSION;
  deliveryId: string;
  dispatchAttemptId: string;
  provider: MinistryEmailDeliveryProvider;
  evidenceId: string;
  observedAt: string;
};

export type MinistryEmailDispatchAcceptanceEvidence =
  MinistryEmailDispatchRecoveryEvidenceBase & {
    kind: "provider_accepted";
    source: MinistryEmailDispatchRecoveryEvidenceSource;
    providerMessageId: string;
  };

export type MinistryEmailDispatchRejectionEvidence =
  MinistryEmailDispatchRecoveryEvidenceBase & {
    kind: "provider_rejected";
    source: "captured_send_response";
    failureCode: string;
  };

export type MinistryEmailDispatchRecoveryEvidence =
  | MinistryEmailDispatchAcceptanceEvidence
  | MinistryEmailDispatchRejectionEvidence;

export type MinistryEmailDispatchRecoveryAuditV1 = {
  schemaVersion: typeof MINISTRY_EMAIL_DISPATCH_RECOVERY_SCHEMA_VERSION;
  resolutionId: string;
  deliveryId: string;
  dispatchAttemptId: string;
  actorId: string;
  resolvedAt: string;
  provider: MinistryEmailDeliveryProvider;
  decision: Extract<
    MinistryEmailDeliveryState,
    "provider_accepted" | "failed"
  >;
  evidenceKind: MinistryEmailDispatchRecoveryEvidence["kind"];
  evidenceSource: MinistryEmailDispatchRecoveryEvidenceSource;
  evidenceId: string;
  evidenceObservedAt: string;
  evidenceFingerprint: string;
  providerMessageId: string | null;
  failureCode: string | null;
};

export type ResolveMinistryEmailDispatchRecoveryInputV1 = {
  resolutionId: string;
  deliveryId: string;
  dispatchAttemptId: string;
  actorId: string;
  resolvedAt: string;
  evidence: MinistryEmailDispatchRecoveryEvidence;
};

export type ResolveMinistryEmailDispatchRecoveryResultV1 =
  | {
      ok: true;
      status: "resolved" | "replayed";
      audit: MinistryEmailDispatchRecoveryAuditV1;
    }
  | {
      ok: false;
      code:
        | "INVALID_RECOVERY_INPUT"
        | "DELIVERY_NOT_FOUND"
        | "DELIVERY_NOT_DISPATCHING"
        | "DISPATCH_ATTEMPT_MISMATCH"
        | "RECOVERY_REPLAY_CONFLICT"
        | "RECOVERY_TRANSITION_CONFLICT"
        | "RECOVERY_PERSISTENCE_UNCERTAIN"
        | "RECOVERY_STORAGE_INVARIANT_VIOLATION";
    };