export type CarePriority = "low" | "medium" | "high";
export type CareEventBase = {
  eventId: string;
  occurredAt: string;
  memberId: string;
  caseId: string;
  actorId?: string | null;
};
export type CareCaseStarted = CareEventBase & { type: "CareCaseStarted"; payload: { ownerId: string | null; priority: CarePriority; note?: string } };
export type CareOwnerAssigned = CareEventBase & { type: "CareOwnerAssigned"; payload: { ownerId: string } };
export type CareNoteAdded = CareEventBase & { type: "CareNoteAdded"; payload: { note: string } };
export type CareStalledDetected = CareEventBase & { type: "CareStalledDetected"; payload: { stalledSince: string; reason?: string } };
export type CareCaseClosed = CareEventBase & { type: "CareCaseClosed"; payload: { closedAt: string } };
export type CareEvent = CareCaseStarted | CareOwnerAssigned | CareNoteAdded | CareStalledDetected | CareCaseClosed;

function base(memberId: string, caseId: string, actorId?: string | null): CareEventBase {
  return { eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), memberId, caseId, actorId: actorId ?? null };
}
export function createCareCaseStartedEvent(memberId: string, caseId: string, ownerId: string | null, priority: CarePriority, note?: string, actorId?: string | null): CareCaseStarted {
  return { ...base(memberId, caseId, actorId), type: "CareCaseStarted", payload: { ownerId, priority, note } };
}
export function createCareOwnerAssignedEvent(memberId: string, caseId: string, ownerId: string, actorId?: string | null): CareOwnerAssigned {
  return { ...base(memberId, caseId, actorId), type: "CareOwnerAssigned", payload: { ownerId } };
}
export function createCareNoteAddedEvent(memberId: string, caseId: string, note: string, actorId?: string | null): CareNoteAdded {
  return { ...base(memberId, caseId, actorId), type: "CareNoteAdded", payload: { note } };
}
export function createCareStalledDetectedEvent(memberId: string, caseId: string, stalledSince: string, reason?: string, actorId?: string | null): CareStalledDetected {
  return { ...base(memberId, caseId, actorId), type: "CareStalledDetected", payload: { stalledSince, reason } };
}
export function createCareCaseClosedEvent(memberId: string, caseId: string, actorId?: string | null): CareCaseClosed {
  const event = base(memberId, caseId, actorId);
  return { ...event, type: "CareCaseClosed", payload: { closedAt: event.occurredAt } };
}