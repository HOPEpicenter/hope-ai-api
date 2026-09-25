import type { CommunityEvent, CommunityPriority } from "./community.events";
export type CommunityInteraction = { interaction: string; occurredAt: string };
export type CommunityEngagementState = { engagementId: string; memberId: string; groupId: string | null; priority: CommunityPriority | null; interactions: CommunityInteraction[]; stalledSince: string | null; completedAt: string | null; status: "active" | "stalled" | "completed" };
const initial = (): CommunityEngagementState => ({ engagementId: "", memberId: "", groupId: null, priority: null, interactions: [], stalledSince: null, completedAt: null, status: "active" });
export function applyCommunityEvent(state: CommunityEngagementState, event: CommunityEvent): CommunityEngagementState {
  const base = { ...state, engagementId: event.engagementId, memberId: event.memberId };
  switch (event.type) {
    case "CommunityEngagementStarted": return { ...base, groupId: event.payload.groupId, priority: event.payload.priority, interactions: [], stalledSince: null, completedAt: null, status: "active" };
    case "CommunityInteractionAdded": return { ...base, interactions: [...state.interactions, { interaction: event.payload.interaction, occurredAt: event.occurredAt }].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)), stalledSince: null, status: "active" };
    case "CommunityStalledDetected": return { ...base, stalledSince: event.payload.stalledSince, status: "stalled" };
    case "CommunityEngagementCompleted": return { ...base, completedAt: event.payload.completedAt, status: "completed" };
  }
}
export class CommunityAggregate { private state: CommunityEngagementState; constructor(initialState?: CommunityEngagementState) { this.state = initialState ?? initial(); } apply(event: CommunityEvent): void { this.state = applyCommunityEvent(this.state, event); } getState(): CommunityEngagementState { return this.state; } }