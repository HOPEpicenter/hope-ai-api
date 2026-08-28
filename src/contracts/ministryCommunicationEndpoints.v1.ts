import type {
  MinistryCommunicationChannel,
  MinistryCommunicationIntent,
  MinistryCommunicationOutcome,
  MinistryCommunicationPreferenceState,
  MinistryCommunicationRecord
} from "../domain/communications/phase5CommunicationContracts";

/** Phase 5 contract-only DTOs. Route implementation belongs to a later PR. */
export type RecordMinistryCommunicationIntentRequestV1 = {
  communicationId: string;
  channel: MinistryCommunicationChannel;
  intent: MinistryCommunicationIntent;
  context: "care" | "formation" | "six_week_followup" | "person_360";
  relatedFollowupPlanId?: string | null;
  notes?: string | null;
};

export type RecordMinistryCommunicationOutcomeRequestV1 = {
  outcome: MinistryCommunicationOutcome;
  notes?: string | null;
};

export type RecordMinistryCommunicationPreferenceRequestV1 = {
  channel: MinistryCommunicationChannel;
  state: MinistryCommunicationPreferenceState;
};

export type MinistryCommunicationResponseV1 = {
  ok: true;
  communication: MinistryCommunicationRecord;
};

export type MinistryCommunicationListResponseV1 = {
  ok: true;
  visitorId: string;
  items: MinistryCommunicationRecord[];
};

export type MinistryCommunicationErrorResponseV1 = {
  ok: false;
  code:
    | "MINISTRY_COMMUNICATION_DISABLED"
    | "COMMUNICATION_CONSENT_REQUIRED"
    | "COMMUNICATION_NOT_FOUND";
  message: string;
};
