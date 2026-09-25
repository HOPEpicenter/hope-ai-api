import type { FormationEvent } from "../../contracts/formationEvent.v1";
import {
  applyFormationEventToProfile,
  createInitialFormationProfile,
  type FormationProfile,
} from "./formationProfile.projection";

export class FormationProfileIndex {
  private readonly profiles = new Map<string, FormationProfile>();

  public replayEvents(events: readonly FormationEvent[]): void {
    for (const event of events) {
      const profile = this.profiles.get(event.memberId)
        ?? createInitialFormationProfile(event.memberId);
      this.profiles.set(
        event.memberId,
        applyFormationEventToProfile(profile, event)
      );
    }
  }

  public getProfile(memberId: string): FormationProfile | null {
    const profile = this.profiles.get(memberId);
    return profile ? cloneProfile(profile) : null;
  }

  public getAllProfiles(): FormationProfile[] {
    return Array.from(this.profiles.values(), cloneProfile);
  }
}

function cloneProfile(profile: FormationProfile): FormationProfile {
  return {
    ...profile,
    activePathway: profile.activePathway
      ? clonePathway(profile.activePathway)
      : null,
    history: profile.history.map(clonePathway),
    stalledSteps: profile.stalledSteps.map(step => ({ ...step })),
  };
}

function clonePathway(pathway: NonNullable<FormationProfile["activePathway"]>) {
  return { ...pathway, steps: pathway.steps.map(step => ({ ...step })) };
}