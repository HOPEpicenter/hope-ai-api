import type { ServingEvent } from "./serving.events";
import { applyServingEventToProfile, createInitialServingProfile, type ServingProfile } from "./servingProfile.projection";
export class ServingProfileIndex {
  private readonly profiles = new Map<string, ServingProfile>();
  private readonly eventsByMember = new Map<string, ServingEvent[]>();
  public replayEvents(events: readonly ServingEvent[]): void { for (const event of events.slice().sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId))) { const profile = this.profiles.get(event.memberId) ?? createInitialServingProfile(event.memberId); this.profiles.set(event.memberId, applyServingEventToProfile(profile, event)); this.eventsByMember.set(event.memberId, [...(this.eventsByMember.get(event.memberId) ?? []), event]); } }
  public getProfile(memberId: string): ServingProfile | null { const profile = this.profiles.get(memberId); return profile ? cloneProfile(profile) : null; }
  public getAllProfiles(): ServingProfile[] { return Array.from(this.profiles.values(), cloneProfile); }
  public getEvents(memberId: string): ServingEvent[] { return (this.eventsByMember.get(memberId) ?? []).map((event) => ({ ...event, payload: { ...event.payload } } as ServingEvent)); }
}
function cloneProfile(profile: ServingProfile): ServingProfile { return { ...profile, activeAssignment: profile.activeAssignment ? cloneAssignment(profile.activeAssignment) : null, history: profile.history.map(cloneAssignment), activities: profile.activities.map((activity) => ({ ...activity })) }; }
function cloneAssignment(assignment: import("./serving.aggregate").ServingAssignmentState): import("./serving.aggregate").ServingAssignmentState { return { ...assignment, activities: assignment.activities.map((activity) => ({ ...activity })) }; }