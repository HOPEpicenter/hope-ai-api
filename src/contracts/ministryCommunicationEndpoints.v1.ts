import type {
  MinistryCommunicationChannel,
  MinistryCommunicationIntent,
  MinistryCommunicationOutcome,
  MinistryCommunicationPreferenceState,
  MinistryCommunicationRecord
} from "../domain/communications/phase5CommunicationContracts";
import type { MinistryEmailDeliveryRecord } from "../domain/communications/ministryEmailDeliveryContracts";

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

/** Staff-initiated email request; recipient and authority are backend-derived. */
export type RequestMinistryEmailDeliveryV1 = {
  deliveryId: string;
  communicationId: string;
  subject: string;
  body: string;
};

export type MinistryEmailDeliveryResponseV1 = {
  ok: true;
  delivery: MinistryEmailDeliveryRecord;
};
