/**
 * Phase 5 Ministry Communication contracts.
 *
 * Contract-only: this slice creates no routes, event persistence, provider
 * integration, scheduler, or outbound delivery behavior.
 */
export const MINISTRY_COMMUNICATION_SCHEMA_VERSION = 1 as const;

export type MinistryCommunicationChannel = "email" | "phone_call";

export type MinistryCommunicationIntent =
  | "follow_up"
  | "pastoral_care"
  | "prayer_response"
  | "formation_encouragement";

export type MinistryCommunicationPreferenceState =
  | "granted"
  | "denied"
  | "unknown";

export type MinistryCommunicationOutcome =
  | "sent"
  | "connected"
  | "left_message"
  | "no_response"
  | "not_sent";

export type MinistryCommunicationEventType =
  | "ministry_communication.preference_recorded"
  | "ministry_communication.intent_recorded"
  | "ministry_communication.outcome_recorded"
  | "ministry_communication.cancelled";

export type MinistryCommunicationPreference = {
  visitorId: string;
  channel: MinistryCommunicationChannel;
  state: MinistryCommunicationPreferenceState;
  recordedAt: string;
  recordedBy: string;
};

export type MinistryCommunicationIntentRecord = {
  communicationId: string;
  visitorId: string;
  channel: MinistryCommunicationChannel;
  intent: MinistryCommunicationIntent;
  requestedAt: string;
  requestedBy: string;
  context: "care" | "formation" | "six_week_followup" | "person_360";
  relatedFollowupPlanId: string | null;
  notes: string | null;
};

export type MinistryCommunicationOutcomeRecord = {
  communicationId: string;
  visitorId: string;
  channel: MinistryCommunicationChannel;
  outcome: MinistryCommunicationOutcome;
  occurredAt: string;
  recordedBy: string;
  notes: string | null;
};

export type MinistryCommunicationEvent = {
  eventId: string;
  visitorId: string;
  type: MinistryCommunicationEventType;
  occurredAt: string;
  actorId: string;
  data:
    | MinistryCommunicationPreference
    | MinistryCommunicationIntentRecord
    | MinistryCommunicationOutcomeRecord
    | { communicationId: string; reason: string };
};

export type MinistryCommunicationRecord = {
  schemaVersion: typeof MINISTRY_COMMUNICATION_SCHEMA_VERSION;
  communicationId: string;
  visitorId: string;
  channel: MinistryCommunicationChannel;
  intent: MinistryCommunicationIntent;
  requestedAt: string;
  requestedBy: string;
  outcome: MinistryCommunicationOutcome | null;
  outcomeAt: string | null;
  outcomeRecordedBy: string | null;
  context: MinistryCommunicationIntentRecord["context"];
  relatedFollowupPlanId: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};
