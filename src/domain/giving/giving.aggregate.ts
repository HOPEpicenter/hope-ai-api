import type { GivingEvent } from "./giving.events";
export type GiftState = { giftId: string; memberId: string; amount: number; designation: string | null; recordedAt: string | null; stalledSince: string | null; completedAt: string | null; status: "active" | "stalled" | "completed" };
const initial = (): GiftState => ({ giftId: "", memberId: "", amount: 0, designation: null, recordedAt: null, stalledSince: null, completedAt: null, status: "active" });
export function applyGivingEvent(state: GiftState, event: GivingEvent): GiftState {
  const base = { ...state, giftId: event.giftId, memberId: event.memberId };
  switch (event.type) {
    case "GiftRecorded": return { ...base, amount: event.payload.amount, designation: event.payload.designation, recordedAt: event.occurredAt, stalledSince: null, completedAt: null, status: "active" };
    case "GiftDesignationUpdated": return { ...base, designation: event.payload.designation };
    case "GivingStalledDetected": return { ...base, stalledSince: event.payload.stalledSince, status: "stalled" };
    case "GivingCycleCompleted": return { ...base, completedAt: event.payload.completedAt, status: "completed" };
  }
}
export class GivingAggregate { private state: GiftState; constructor(initialState?: GiftState) { this.state = initialState ?? initial(); } apply(event: GivingEvent): void { this.state = applyGivingEvent(this.state, event); } getState(): GiftState { return this.state; } }