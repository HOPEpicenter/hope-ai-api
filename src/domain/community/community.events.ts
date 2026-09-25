export type CommunityPriority = "low" | "medium" | "high";
export type CommunityEventBase = { eventId: string; occurredAt: string; memberId: string; engagementId: string; actorId?: string | null };
export type CommunityEngagementStarted = CommunityEventBase & { type: "CommunityEngagementStarted"; payload: { groupId: string | null; priority: CommunityPriority } };
export type CommunityInteractionAdded = CommunityEventBase & { type: "CommunityInteractionAdded"; payload: { interaction: string } };
export type CommunityStalledDetected = CommunityEventBase & { type: "CommunityStalledDetected"; payload: { stalledSince: string; reason?: string } };
export type CommunityEngagementCompleted = CommunityEventBase & { type: "CommunityEngagementCompleted"; payload: { completedAt: string } };
export type CommunityEvent = CommunityEngagementStarted | CommunityInteractionAdded | CommunityStalledDetected | CommunityEngagementCompleted;

function base(memberId: string, engagementId: string, actorId?: string | null): CommunityEventBase {
  return { eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), memberId, engagementId, actorId: actorId ?? null };
}

export function createCommunityEngagementStartedEvent(memberId: string, engagementId: string, groupId: string | null, priority: CommunityPriority, actorId?: string | null): CommunityEngagementStarted { return { ...base(memberId, engagementId, actorId), type: "CommunityEngagementStarted", payload: { groupId, priority } }; }
export function createCommunityInteractionAddedEvent(memberId: string, engagementId: string, interaction: string, actorId?: string | null): CommunityInteractionAdded { return { ...base(memberId, engagementId, actorId), type: "CommunityInteractionAdded", payload: { interaction } }; }
export function createCommunityStalledDetectedEvent(memberId: string, engagementId: string, stalledSince: string, reason?: string, actorId?: string | null): CommunityStalledDetected { return { ...base(memberId, engagementId, actorId), type: "CommunityStalledDetected", payload: { stalledSince, reason } }; }
export function createCommunityEngagementCompletedEvent(memberId: string, engagementId: string, actorId?: string | null): CommunityEngagementCompleted { const event = base(memberId, engagementId, actorId); return { ...event, type: "CommunityEngagementCompleted", payload: { completedAt: event.occurredAt } }; }