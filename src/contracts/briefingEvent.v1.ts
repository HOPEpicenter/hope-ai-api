export type BriefingEventBase = {
  eventId: string;
  occurredAt: string;
  actorId?: string | null;
  source: "system" | "api";
  briefingId: string;
  role: "care_leader" | "pastor";
};

export type BriefingGenerated = BriefingEventBase & {
  type: "BriefingGenerated";
  payload: {
    generatedAt: string;
    timeRange: {
      from: string;
      to: string;
    };
  };
};

export type BriefingDelivered = BriefingEventBase & {
  type: "BriefingDelivered";
  payload: {
    channel: "email" | "app" | "pdf";
    deliveredAt: string;
    recipientId: string;
  };
};

export type BriefingAcknowledged = BriefingEventBase & {
  type: "BriefingAcknowledged";
  payload: {
    acknowledgedAt: string;
    recipientId: string;
  };
};

export type LeaderBriefingUpdated = {
  eventId: string;
  occurredAt: string;
  source: "system";
  type: "LeaderBriefingUpdated";
  payload: {
    summary: string;
    metadata: Record<string, unknown>;
  };
};

export type PastorBriefingUpdated = {
  eventId: string;
  occurredAt: string;
  source: "system";
  type: "PastorBriefingUpdated";
  payload: {
    summary: string;
    metadata: Record<string, unknown>;
  };
};

export type BriefingEvent =
  | BriefingGenerated
  | BriefingDelivered
  | BriefingAcknowledged
  | LeaderBriefingUpdated
  | PastorBriefingUpdated;

function createBriefingEventBase(
  briefingId: string,
  role: BriefingEventBase["role"],
  actorId?: string | null
): BriefingEventBase {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    actorId: actorId ?? null,
    source: "system",
    briefingId,
    role,
  };
}

export function createBriefingGeneratedEvent(
  briefingId: string,
  role: BriefingEventBase["role"],
  timeRange: { from: string; to: string },
  actorId?: string | null
): BriefingGenerated {
  const event = createBriefingEventBase(briefingId, role, actorId);

  return {
    ...event,
    type: "BriefingGenerated",
    payload: {
      generatedAt: event.occurredAt,
      timeRange,
    },
  };
}

export function createBriefingDeliveredEvent(
  briefingId: string,
  role: BriefingEventBase["role"],
  channel: "email" | "app" | "pdf",
  recipientId: string,
  actorId?: string | null
): BriefingDelivered {
  const event = createBriefingEventBase(briefingId, role, actorId);

  return {
    ...event,
    type: "BriefingDelivered",
    payload: {
      channel,
      deliveredAt: event.occurredAt,
      recipientId,
    },
  };
}

export function createBriefingAcknowledgedEvent(
  briefingId: string,
  role: BriefingEventBase["role"],
  recipientId: string,
  actorId?: string | null
): BriefingAcknowledged {
  const event = createBriefingEventBase(briefingId, role, actorId);

  return {
    ...event,
    type: "BriefingAcknowledged",
    payload: {
      acknowledgedAt: event.occurredAt,
      recipientId,
    },
  };
}

export function createLeaderBriefingUpdatedEvent(
  summary: string,
  metadata: Record<string, unknown>
): LeaderBriefingUpdated {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    source: "system",
    type: "LeaderBriefingUpdated",
    payload: { summary, metadata },
  };
}

export function createPastorBriefingUpdatedEvent(
  summary: string,
  metadata: Record<string, unknown>
): PastorBriefingUpdated {
  return {
    eventId: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    source: "system",
    type: "PastorBriefingUpdated",
    payload: { summary, metadata },
  };
}