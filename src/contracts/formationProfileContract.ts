/**
 * Ops Dashboard contract types (v1).
 *
 * IMPORTANT:
 * - Azure Table transport fields (etag, timestamp, odata.metadata) are intentionally excluded.
 * - Backend may return extra fields; dashboard must ignore unknown properties.
 */

export type FormationStage = "Visitor" | "Guest" | "Connected";

/**
 * Formation event types supported by Phase 3 recorder logic.
 * Keep in sync with domain/formation/phase3_1_scope.
 */
export type FormationEventType =
  | "SERVICE_ATTENDED"
  | "FOLLOWUP_ASSIGNED"
  | "FOLLOWUP_CONTACTED"
  | "FOLLOWUP_OUTCOME_RECORDED"
  | "NEXT_STEP_SELECTED"
  | "INFO_REQUESTED"
  | "PRAYER_REQUESTED";

/**
 * FormationProfile snapshot.
 * Canonical storage keys:
 *   partitionKey = "VISITOR"
 *   rowKey       = visitorId
 */
export interface FormationProfileSnapshot {
  // Identity / canonical keys
  partitionKey: "VISITOR";
  rowKey: string; // visitorId
  visitorId: string;

  // Stage
  stage: FormationStage;
  stageUpdatedAt?: string;
  stageUpdatedBy?: string;
  stageReason?: string;

  // Assignment
  assignedTo?: string;

  // Last event
  lastEventType?: FormationEventType | string;
  lastEventAt?: string;

  // Touchpoints (optional)
  lastServiceAttendedAt?: string;
  lastFollowupAssignedAt?: string;
  lastFollowupContactedAt?: string;
  lastFollowupOutcomeAt?: string;
  lastNextStepAt?: string;
  lastPrayerRequestedAt?: string;

  // Snapshot update timestamp
  updatedAt: string;

  // Forward-compatible expansion
  [key: string]: unknown;
}

export interface FormationProfilesResponse {
  ok: true;
  items: FormationProfileSnapshot[];
  cursor: string | null;
}

export interface FormationProfilesErrorResponse {
  ok: false;
  error: string;
}

export type FormationProfilesApiResponse =
  | FormationProfilesResponse
  | FormationProfilesErrorResponse;