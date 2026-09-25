import type { GivingEvent } from "./giving.events";
import { applyGivingEventToProfile, createInitialGivingProfile, type GivingProfile } from "./givingProfile.projection";
export class GivingProfileIndex {
  private readonly profiles = new Map<string, GivingProfile>();
  private readonly eventsByMember = new Map<string, GivingEvent[]>();
  public replayEvents(events: readonly GivingEvent[]): void { for (const event of events.slice().sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId))) { const profile = this.profiles.get(event.memberId) ?? createInitialGivingProfile(event.memberId); this.profiles.set(event.memberId, applyGivingEventToProfile(profile, event)); this.eventsByMember.set(event.memberId, [...(this.eventsByMember.get(event.memberId) ?? []), event]); } }
  public getProfile(memberId: string): GivingProfile | null { const profile = this.profiles.get(memberId); return profile ? cloneProfile(profile) : null; }
  public getAllProfiles(): GivingProfile[] { return Array.from(this.profiles.values(), cloneProfile); }
  public getEvents(memberId: string): GivingEvent[] { return (this.eventsByMember.get(memberId) ?? []).map((event) => ({ ...event, payload: { ...event.payload } } as GivingEvent)); }
}
function cloneProfile(profile: GivingProfile): GivingProfile { return { ...profile, activeGift: profile.activeGift ? { ...profile.activeGift } : null, gifts: profile.gifts.map((gift) => ({ ...gift })) }; }