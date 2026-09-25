import type { CommunityEvent } from "./community.events";
import { applyCommunityEventToProfile, createInitialCommunityProfile, type CommunityProfile } from "./communityProfile.projection";
export class CommunityProfileIndex {
  private readonly profiles = new Map<string, CommunityProfile>();
  private readonly eventsByMember = new Map<string, CommunityEvent[]>();
  public replayEvents(events: readonly CommunityEvent[]): void { for (const event of events.slice().sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId))) { const profile = this.profiles.get(event.memberId) ?? createInitialCommunityProfile(event.memberId); this.profiles.set(event.memberId, applyCommunityEventToProfile(profile, event)); this.eventsByMember.set(event.memberId, [...(this.eventsByMember.get(event.memberId) ?? []), event]); } }
  public getProfile(memberId: string): CommunityProfile | null { const profile = this.profiles.get(memberId); return profile ? cloneProfile(profile) : null; }
  public getAllProfiles(): CommunityProfile[] { return Array.from(this.profiles.values(), cloneProfile); }
  public getEvents(memberId: string): CommunityEvent[] { return (this.eventsByMember.get(memberId) ?? []).map((event) => ({ ...event, payload: { ...event.payload } } as CommunityEvent)); }
}
function cloneProfile(profile: CommunityProfile): CommunityProfile { return { ...profile, activeEngagement: profile.activeEngagement ? cloneEngagement(profile.activeEngagement) : null, history: profile.history.map(cloneEngagement), interactions: profile.interactions.map((interaction) => ({ ...interaction })) }; }
function cloneEngagement(engagement: import("./community.aggregate").CommunityEngagementState): import("./community.aggregate").CommunityEngagementState { return { ...engagement, interactions: engagement.interactions.map((interaction) => ({ ...interaction })) }; }