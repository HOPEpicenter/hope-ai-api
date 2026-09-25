import type { CareEvent, CarePriority } from "./care.events";
export type CareNote = { note: string; occurredAt: string };
export type CareCaseState = { caseId: string; memberId: string; ownerId: string | null; priority: CarePriority | null; notes: CareNote[]; stalledSince: string | null; closedAt: string | null; status: "open" | "stalled" | "closed" };
const initial: CareCaseState = { caseId: "", memberId: "", ownerId: null, priority: null, notes: [], stalledSince: null, closedAt: null, status: "open" };
export function applyCareEvent(state: CareCaseState, event: CareEvent): CareCaseState {
  const base = { ...state, caseId: event.caseId, memberId: event.memberId };
  switch (event.type) {
    case "CareCaseStarted": return { ...base, ownerId: event.payload.ownerId, priority: event.payload.priority, notes: event.payload.note ? [{ note: event.payload.note, occurredAt: event.occurredAt }] : [], status: "open" };
    case "CareOwnerAssigned": return { ...base, ownerId: event.payload.ownerId };
    case "CareNoteAdded": return { ...base, notes: [...state.notes, { note: event.payload.note, occurredAt: event.occurredAt }].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)), status: "open", stalledSince: null };
    case "CareStalledDetected": return { ...base, status: "stalled", stalledSince: event.payload.stalledSince };
    case "CareCaseClosed": return { ...base, status: "closed", closedAt: event.payload.closedAt };
  }
}
export class CareAggregate { private state: CareCaseState; constructor(initialState?: CareCaseState) { this.state = initialState ?? { ...initial, notes: [] }; } apply(event: CareEvent): void { this.state = applyCareEvent(this.state, event); } getState(): CareCaseState { return this.state; } }