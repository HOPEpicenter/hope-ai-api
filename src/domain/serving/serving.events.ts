export type ServingPriority = "low" | "medium" | "high";
export type ServingEventBase = { eventId: string; occurredAt: string; memberId: string; assignmentId: string; actorId?: string | null };
export type ServingAssignmentStarted = ServingEventBase & { type: "ServingAssignmentStarted"; payload: { roleId: string | null; priority: ServingPriority } };
export type ServingRoleAssigned = ServingEventBase & { type: "ServingRoleAssigned"; payload: { roleId: string } };
export type ServingActivityRecorded = ServingEventBase & { type: "ServingActivityRecorded"; payload: { activity: string } };
export type ServingStalledDetected = ServingEventBase & { type: "ServingStalledDetected"; payload: { stalledSince: string; reason?: string } };
export type ServingAssignmentClosed = ServingEventBase & { type: "ServingAssignmentClosed"; payload: { closedAt: string } };
export type ServingEvent = ServingAssignmentStarted | ServingRoleAssigned | ServingActivityRecorded | ServingStalledDetected | ServingAssignmentClosed;

function base(memberId: string, assignmentId: string, actorId?: string | null): ServingEventBase {
  return { eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), memberId, assignmentId, actorId: actorId ?? null };
}
export function createServingAssignmentStartedEvent(memberId: string, assignmentId: string, roleId: string | null, priority: ServingPriority, actorId?: string | null): ServingAssignmentStarted { return { ...base(memberId, assignmentId, actorId), type: "ServingAssignmentStarted", payload: { roleId, priority } }; }
export function createServingRoleAssignedEvent(memberId: string, assignmentId: string, roleId: string, actorId?: string | null): ServingRoleAssigned { return { ...base(memberId, assignmentId, actorId), type: "ServingRoleAssigned", payload: { roleId } }; }
export function createServingActivityRecordedEvent(memberId: string, assignmentId: string, activity: string, actorId?: string | null): ServingActivityRecorded { return { ...base(memberId, assignmentId, actorId), type: "ServingActivityRecorded", payload: { activity } }; }
export function createServingStalledDetectedEvent(memberId: string, assignmentId: string, stalledSince: string, reason?: string, actorId?: string | null): ServingStalledDetected { return { ...base(memberId, assignmentId, actorId), type: "ServingStalledDetected", payload: { stalledSince, reason } }; }
export function createServingAssignmentClosedEvent(memberId: string, assignmentId: string, actorId?: string | null): ServingAssignmentClosed { const event = base(memberId, assignmentId, actorId); return { ...event, type: "ServingAssignmentClosed", payload: { closedAt: event.occurredAt } }; }