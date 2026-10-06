import type {
  MinistryEmailDispatchRecoveryEvidence
} from "./ministryEmailDispatchRecovery.v1";
import type {
  MinistryEmailDeliveryProvider
} from "../domain/communications/ministryEmailDeliveryContracts";

export type PersistedMinistryEmailProviderEvidenceV1 = {
  schemaVersion: 1;
  provider: MinistryEmailDeliveryProvider;
  evidenceId: string;
  deliveryId: string;
  dispatchAttemptId: string;
  kind: "provider_accepted";
  source: "verified_provider_event";
  observedAt: string;
  providerMessageId: string;
  eventType: string;
  evidenceFingerprint: string;
};

export type PersistMinistryEmailProviderEvidenceInputV1 = {
  eventType: string;
  evidence: Extract<
    MinistryEmailDispatchRecoveryEvidence,
    {
      kind: "provider_accepted";
    }
  > & {
    source: "verified_provider_event";
  };
};

export type PersistMinistryEmailProviderEvidenceResultV1 =
  | {
      ok: true;
      status: "persisted" | "replayed";
      record: PersistedMinistryEmailProviderEvidenceV1;
    }
  | {
      ok: false;
      code:
        | "INVALID_PROVIDER_EVIDENCE"
        | "PROVIDER_EVIDENCE_REPLAY_CONFLICT"
        | "PROVIDER_EVIDENCE_PERSISTENCE_UNCERTAIN";
    };