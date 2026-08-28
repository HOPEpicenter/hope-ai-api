import { randomUUID } from "node:crypto";
import {
  projectMinistryCommunications,
  type MinistryCommunicationProjection
} from "../../domain/communications/projectMinistryCommunications";
import type {
  MinistryCommunicationChannel,
  MinistryCommunicationEvent,
  MinistryCommunicationIntent,
  MinistryCommunicationOutcome,
  MinistryCommunicationPreferenceState
} from "../../domain/communications/phase5CommunicationContracts";
import { MinistryCommunicationEventsRepository } from "../../repositories/ministryCommunicationEventsRepository";
import { readCanonicalStaffIdentity } from "../staff/readCanonicalStaffDirectory";

type Repository = Pick<MinistryCommunicationEventsRepository, "append" | "listByVisitor">;
type StaffIdentity = { staffId: string; status: "active" | "inactive" };

export type MinistryCommunicationCommandDependencies = {
  repository?: Repository;
  now?: () => string;
  newEventId?: () => string;
  readActor?: (staffId: string) => Promise<StaffIdentity | null>;
};

export type MinistryCommunicationCommandResult =
  | { accepted: true; status: number; created: boolean; eventId: string; communication: MinistryCommunicationProjection }
  | { accepted: false; status: number; error: string };

const CHANNELS = new Set<MinistryCommunicationChannel>(["email", "phone_call"]);
const PREFERENCES = new Set<MinistryCommunicationPreferenceState>(["granted", "denied", "unknown"]);
const INTENTS = new Set<MinistryCommunicationIntent>(["follow_up", "pastoral_care", "prayer_response", "formation_encouragement"]);
const OUTCOMES = new Set<MinistryCommunicationOutcome>(["sent", "connected", "left_message", "no_response", "not_sent"]);

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function repositoryFor(dependencies: MinistryCommunicationCommandDependencies): Repository {
  return dependencies.repository ?? new MinistryCommunicationEventsRepository();
}

function eventId(): string {
  return `evt-${randomUUID().replace(/-/g, "")}`;
}

async function requireActor(
  actorId: string,
  dependencies: MinistryCommunicationCommandDependencies
): Promise<MinistryCommunicationCommandResult | null> {
  const actor = await (dependencies.readActor ?? readCanonicalStaffIdentity)(actorId);
  if (!actor || actor.status !== "active") {
    return { accepted: false, status: 403, error: "x-hope-staff-actor-id must reference an active canonical Staff identity" };
  }
  return null;
}

async function append(
  event: MinistryCommunicationEvent,
  dependencies: MinistryCommunicationCommandDependencies
): Promise<MinistryCommunicationCommandResult> {
  const repository = repositoryFor(dependencies);
  const created = await repository.append(event);
  const communication = projectMinistryCommunications(
    event.visitorId,
    await repository.listByVisitor(event.visitorId)
  );
  return {
    accepted: true,
    status: created ? 202 : 200,
    created,
    eventId: event.eventId,
    communication
  };
}

export async function readMinistryCommunications(
  visitorId: string,
  dependencies: MinistryCommunicationCommandDependencies = {}
): Promise<MinistryCommunicationProjection> {
  const normalizedVisitorId = text(visitorId);
  return projectMinistryCommunications(
    normalizedVisitorId,
    await repositoryFor(dependencies).listByVisitor(normalizedVisitorId)
  );
}

export async function recordMinistryCommunicationPreference(input: {
  visitorId: string; actorId: string; channel: MinistryCommunicationChannel; state: MinistryCommunicationPreferenceState;
}, dependencies: MinistryCommunicationCommandDependencies = {}): Promise<MinistryCommunicationCommandResult> {
  const visitorId = text(input.visitorId);
  const actorId = text(input.actorId);
  if (!visitorId) return { accepted: false, status: 400, error: "visitorId is required" };
  if (!CHANNELS.has(input.channel) || !PREFERENCES.has(input.state)) return { accepted: false, status: 400, error: "channel and state are required" };
  const actorFailure = await requireActor(actorId, dependencies);
  if (actorFailure) return actorFailure;
  const occurredAt = (dependencies.now ?? (() => new Date().toISOString()))();
  return append({
    eventId: (dependencies.newEventId ?? eventId)(), visitorId,
    type: "ministry_communication.preference_recorded", occurredAt, actorId,
    data: { visitorId, channel: input.channel, state: input.state, recordedAt: occurredAt, recordedBy: actorId }
  }, dependencies);
}

export async function recordMinistryCommunicationIntent(input: {
  visitorId: string; actorId: string; communicationId: string; channel: MinistryCommunicationChannel;
  intent: MinistryCommunicationIntent; context: "care" | "formation" | "six_week_followup" | "person_360";
  relatedFollowupPlanId?: string | null; notes?: string | null;
}, dependencies: MinistryCommunicationCommandDependencies = {}): Promise<MinistryCommunicationCommandResult> {
  const visitorId = text(input.visitorId);
  const actorId = text(input.actorId);
  const communicationId = text(input.communicationId);
  if (!visitorId || !communicationId) return { accepted: false, status: 400, error: "visitorId and communicationId are required" };
  if (!CHANNELS.has(input.channel) || !INTENTS.has(input.intent)) return { accepted: false, status: 400, error: "channel and intent are required" };
  const actorFailure = await requireActor(actorId, dependencies);
  if (actorFailure) return actorFailure;
  const repository = repositoryFor(dependencies);
  const existing = projectMinistryCommunications(visitorId, await repository.listByVisitor(visitorId));
  if (existing.items.some(item => item.communicationId === communicationId)) {
    return { accepted: true, status: 200, created: false, eventId: communicationId, communication: existing };
  }
  const preference = existing.preferences.find(item => item.channel === input.channel);
  if (preference?.state !== "granted") return { accepted: false, status: 409, error: "Recorded consent is required for this communication channel" };
  const occurredAt = (dependencies.now ?? (() => new Date().toISOString()))();
  return append({
    eventId: (dependencies.newEventId ?? eventId)(), visitorId,
    type: "ministry_communication.intent_recorded", occurredAt, actorId,
    data: { communicationId, visitorId, channel: input.channel, intent: input.intent, requestedAt: occurredAt, requestedBy: actorId, context: input.context, relatedFollowupPlanId: text(input.relatedFollowupPlanId) || null, notes: text(input.notes) || null }
  }, dependencies);
}

export async function recordMinistryCommunicationOutcome(input: {
  visitorId: string; actorId: string; communicationId: string; outcome: MinistryCommunicationOutcome; notes?: string | null;
}, dependencies: MinistryCommunicationCommandDependencies = {}): Promise<MinistryCommunicationCommandResult> {
  return recordTerminalEvent("ministry_communication.outcome_recorded", input, dependencies);
}

export async function cancelMinistryCommunication(input: {
  visitorId: string; actorId: string; communicationId: string; reason: string;
}, dependencies: MinistryCommunicationCommandDependencies = {}): Promise<MinistryCommunicationCommandResult> {
  return recordTerminalEvent("ministry_communication.cancelled", input, dependencies);
}

async function recordTerminalEvent(
  type: "ministry_communication.outcome_recorded" | "ministry_communication.cancelled",
  input: { visitorId: string; actorId: string; communicationId: string; outcome?: MinistryCommunicationOutcome; notes?: string | null; reason?: string },
  dependencies: MinistryCommunicationCommandDependencies
): Promise<MinistryCommunicationCommandResult> {
  const visitorId = text(input.visitorId); const actorId = text(input.actorId); const communicationId = text(input.communicationId);
  if (!visitorId || !communicationId) return { accepted: false, status: 400, error: "visitorId and communicationId are required" };
  if (type.endsWith("outcome_recorded") && !OUTCOMES.has(input.outcome as MinistryCommunicationOutcome)) return { accepted: false, status: 400, error: "outcome is required" };
  if (type.endsWith("cancelled") && !text(input.reason)) return { accepted: false, status: 400, error: "reason is required" };
  const actorFailure = await requireActor(actorId, dependencies); if (actorFailure) return actorFailure;
  const repository = repositoryFor(dependencies);
  const current = projectMinistryCommunications(visitorId, await repository.listByVisitor(visitorId));
  const record = current.items.find(item => item.communicationId === communicationId);
  if (!record) return { accepted: false, status: 404, error: "Communication not found" };
  if (record.cancelledAt) return { accepted: true, status: 200, created: false, eventId: communicationId, communication: current };
  if (type.endsWith("outcome_recorded") && record.outcome) return { accepted: true, status: 200, created: false, eventId: communicationId, communication: current };
  const occurredAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const data = type.endsWith("outcome_recorded")
    ? { communicationId, visitorId, channel: record.channel, outcome: input.outcome as MinistryCommunicationOutcome, occurredAt, recordedBy: actorId, notes: text(input.notes) || null }
    : { communicationId, reason: text(input.reason) };
  return append({ eventId: (dependencies.newEventId ?? eventId)(), visitorId, type, occurredAt, actorId, data }, dependencies);
}
