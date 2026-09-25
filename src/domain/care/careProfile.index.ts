import type { CareEvent } from "./care.events";
import { applyCareEventToProfile, createInitialCareProfile, type CareProfile } from "./careProfile.projection";

export class CareProfileIndex {
  private readonly profiles = new Map<string, CareProfile>();
  private readonly eventsByMember = new Map<string, CareEvent[]>();

  public replayEvents(events: readonly CareEvent[]): void {
    for (const event of events.slice().sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId))) {
      const profile = this.profiles.get(event.memberId) ?? createInitialCareProfile(event.memberId);
      this.profiles.set(event.memberId, applyCareEventToProfile(profile, event));
      this.eventsByMember.set(event.memberId, [...(this.eventsByMember.get(event.memberId) ?? []), event]);
    }
  }

  public getProfile(memberId: string): CareProfile | null {
    const profile = this.profiles.get(memberId);
    return profile ? cloneProfile(profile) : null;
  }

  public getAllProfiles(): CareProfile[] {
    return Array.from(this.profiles.values(), cloneProfile);
  }

  public getEvents(memberId: string): CareEvent[] {
    return (this.eventsByMember.get(memberId) ?? []).map((event) => ({ ...event, payload: { ...event.payload } } as CareEvent));
  }
}

function cloneProfile(profile: CareProfile): CareProfile {
  return { ...profile, cases: profile.cases.map((careCase) => ({ ...careCase, notes: careCase.notes.map((note) => ({ ...note })) })), activeCaseIds: [...profile.activeCaseIds], stalledCaseIds: [...profile.stalledCaseIds], closedCaseIds: [...profile.closedCaseIds] };
}