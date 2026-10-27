export type FormationEventEvidenceAcquisitionIdentityV1 = {
  readonly visitorId: string;
  readonly eventId: string;
  readonly occurredAt: string;
};

export type FormationEventEvidenceAcquisitionRecordV1 = {
  readonly partitionKey: unknown;
  readonly rowKey: unknown;
  readonly visitorId: unknown;
  readonly id: unknown;
  readonly occurredAt: unknown;
  readonly type?: unknown;
  readonly recordedAt?: unknown;
  readonly channel?: unknown;
  readonly visibility?: unknown;
  readonly sensitivity?: unknown;
  readonly summary?: unknown;
  readonly metadata?: unknown;
  readonly idempotencyKey?: unknown;
};

export type FormationEventEvidenceAcquisitionObservationV1 =
  | {
      readonly availability: "available";
      readonly record: FormationEventEvidenceAcquisitionRecordV1;
    }
  | { readonly availability: "absent_observed" }
  | { readonly availability: "unavailable" }
  | { readonly availability: "partial" };

export type FormationEventEvidenceAcquisitionInputV1 = {
  readonly identity: FormationEventEvidenceAcquisitionIdentityV1;
  readonly observation: FormationEventEvidenceAcquisitionObservationV1;
};

export type FormationEventEvidenceAcquisitionStatusV1 =
  | "matching_evidence"
  | "observed_absence"
  | "unavailable"
  | "ambiguous";

export type FormationEventEvidenceAcquisitionReasonCodeV1 =
  | "record_matches_trusted_identity"
  | "absence_observed_not_historical"
  | "observation_unavailable"
  | "observation_partial"
  | "input_malformed"
  | "identity_visitor_id_malformed"
  | "identity_visitor_id_invalid_for_partition_key"
  | "identity_event_id_malformed"
  | "identity_event_id_invalid_for_row_key"
  | "identity_malformed"
  | "identity_occurred_at_invalid"
  | "observation_malformed"
  | "observation_status_invalid"
  | "record_malformed"
  | "partition_key_mismatch"
  | "row_key_mismatch"
  | "visitor_id_mismatch"
  | "event_id_mismatch"
  | "occurred_at_mismatch"
  | "adversarial_input";

export type FormationEventEvidenceAcquisitionResultV1 = {
  readonly contractVersion: "formation_event_evidence_acquisition.v1";
  readonly status: FormationEventEvidenceAcquisitionStatusV1;
  readonly reasonCode: FormationEventEvidenceAcquisitionReasonCodeV1;
  readonly candidateRowKey: string | null;
  readonly advisoryOnly: true;
  readonly readOnly: true;
  readonly authoritative: false;
  readonly historicalAbsenceEstablished: false;
  readonly transactionallyComplete: false;
  readonly retryAuthorized: false;
  readonly repairAuthorized: false;
  readonly replayAuthorized: false;
  readonly reconciliationAuthorized: false;
};
