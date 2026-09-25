import type { ServingEvent, ServingPriority } from "./serving.events";
export type ServingActivity = { activity: string; occurredAt: string };
export type ServingAssignmentState = { assignmentId: string; memberId: string; roleId: string | null; priority: ServingPriority | null; activities: ServingActivity[]; stalledSince: string | null; closedAt: string | null; status: "active" | "stalled" | "closed" };
const initial = (): ServingAssignmentState => ({ assignmentId: "", memberId: "", roleId: null, priority: null, activities: [], stalledSince: null, closedAt: null, status: "active" });
export function applyServingEvent(state: ServingAssignmentState, event: ServingEvent): ServingAssignmentState {
  const base = { ...state, assignmentId: event.assignmentId, memberId: event.memberId };
  switch (event.type) {
    case "ServingAssignmentStarted": return { ...base, roleId: event.payload.roleId, priority: event.payload.priority, activities: [], stalledSince: null, closedAt: null, status: "active" };
    case "ServingRoleAssigned": return { ...base, roleId: event.payload.roleId };
    case "ServingActivityRecorded": return { ...base, activities: [...state.activities, { activity: event.payload.activity, occurredAt: event.occurredAt }].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)), stalledSince: null, status: "active" };
    case "ServingStalledDetected": return { ...base, stalledSince: event.payload.stalledSince, status: "stalled" };
    case "ServingAssignmentClosed": return { ...base, closedAt: event.payload.closedAt, status: "closed" };
  }
}
export class ServingAggregate { private state: ServingAssignmentState; constructor(initialState?: ServingAssignmentState) { this.state = initialState ?? initial(); } apply(event: ServingEvent): void { this.state = applyServingEvent(this.state, event); } getState(): ServingAssignmentState { return this.state; } }