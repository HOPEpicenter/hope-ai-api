import {
  MINISTRY_COMMUNICATION_SCHEMA_VERSION,
  type MinistryCommunicationEvent,
  type MinistryCommunicationIntentRecord,
  type MinistryCommunicationOutcomeRecord,
  type MinistryCommunicationPreference,
  type MinistryCommunicationRecord
} from "./phase5CommunicationContracts";

export type MinistryCommunicationProjection = {
  schemaVersion: typeof MINISTRY_COMMUNICATION_SCHEMA_VERSION;
  visitorId: string;
  preferences: MinistryCommunicationPreference[];
  items: MinistryCommunicationRecord[];
};

function normalized(value: unknown): string {
  return String(value ?? "").trim();
}

function isPreference(
  event: MinistryCommunicationEvent
): event is MinistryCommunicationEvent & { data: MinistryCommunicationPreference } {
  const data = event.data as Partial<MinistryCommunicationPreference>;

  return event.type === "ministry_communication.preference_recorded" &&
    Boolean(normalized(data.channel)) &&
    Boolean(normalized(data.recordedAt)) &&
    Boolean(normalized(data.recordedBy));
}

function isIntent(
  event: MinistryCommunicationEvent
): event is MinistryCommunicationEvent & { data: MinistryCommunicationIntentRecord } {
  const data = event.data as Partial<MinistryCommunicationIntentRecord>;

  return event.type === "ministry_communication.intent_recorded" &&
    Boolean(normalized(data.communicationId)) &&
    Boolean(normalized(data.channel)) &&
    Boolean(normalized(data.intent)) &&
    Boolean(normalized(data.requestedAt)) &&
    Boolean(normalized(data.requestedBy)) &&
    Boolean(normalized(data.context));
}

function isOutcome(
  event: MinistryCommunicationEvent
): event is MinistryCommunicationEvent & { data: MinistryCommunicationOutcomeRecord } {
  const data = event.data as Partial<MinistryCommunicationOutcomeRecord>;

  return event.type === "ministry_communication.outcome_recorded" &&
    Boolean(normalized(data.communicationId)) &&
    Boolean(normalized(data.channel)) &&
    Boolean(normalized(data.outcome)) &&
    Boolean(normalized(data.occurredAt)) &&
    Boolean(normalized(data.recordedBy));
}

function isCancellation(
  event: MinistryCommunicationEvent
): event is MinistryCommunicationEvent & {
  data: { communicationId: string; reason: string };
} {
  const data = event.data as Partial<{ communicationId: string }>;

  return event.type === "ministry_communication.cancelled" &&
    Boolean(normalized(data.communicationId));
}

function asRecord(intent: MinistryCommunicationIntentRecord): MinistryCommunicationRecord {
  return {
    schemaVersion: MINISTRY_COMMUNICATION_SCHEMA_VERSION,
    communicationId: intent.communicationId,
    visitorId: intent.visitorId,
    channel: intent.channel,
    intent: intent.intent,
    requestedAt: intent.requestedAt,
    requestedBy: intent.requestedBy,
    outcome: null,
    outcomeAt: null,
    outcomeRecordedBy: null,
    context: intent.context,
    relatedFollowupPlanId: intent.relatedFollowupPlanId,
    notes: intent.notes,
    cancelledAt: null,
    cancellationReason: null
  };
}

/**
 * Replays immutable communication events into the visitor's current
 * preference state and staff-recorded communication history.
 */
export function projectMinistryCommunications(
  visitorId: string,
  events: MinistryCommunicationEvent[]
): MinistryCommunicationProjection {
  const normalizedVisitorId = normalized(visitorId);
  const ordered = [...events]
    .filter(event => normalized(event.visitorId) === normalizedVisitorId)
    .sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) ||
      a.eventId.localeCompare(b.eventId)
    );
  const preferences = new Map<string, MinistryCommunicationPreference>();
  const records = new Map<string, MinistryCommunicationRecord>();

  for (const event of ordered) {
    if (isPreference(event)) {
      preferences.set(event.data.channel, event.data);
      continue;
    }

    if (isIntent(event)) {
      if (!records.has(event.data.communicationId)) {
        records.set(event.data.communicationId, asRecord(event.data));
      }
      continue;
    }

    if (isOutcome(event)) {
      const record = records.get(event.data.communicationId);

      if (record && record.cancelledAt === null) {
        record.outcome = event.data.outcome;
        record.outcomeAt = event.data.occurredAt;
        record.outcomeRecordedBy = event.data.recordedBy;
        record.notes = event.data.notes ?? record.notes;
      }
      continue;
    }

    if (isCancellation(event)) {
      const record = records.get(event.data.communicationId);

      if (record && record.cancelledAt === null) {
        record.cancelledAt = event.occurredAt;
        record.cancellationReason = normalized(event.data.reason) || null;
      }
    }
  }

  return {
    schemaVersion: MINISTRY_COMMUNICATION_SCHEMA_VERSION,
    visitorId: normalizedVisitorId,
    preferences: [...preferences.values()].sort((a, b) =>
      a.channel.localeCompare(b.channel)
    ),
    items: [...records.values()].sort((a, b) =>
      b.requestedAt.localeCompare(a.requestedAt) ||
      a.communicationId.localeCompare(b.communicationId)
    )
  };
}
