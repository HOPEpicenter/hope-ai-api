import type { FormationEvent } from "../../contracts/formationEvent.v1";

export type FormationProfileStep = {
  stepId: string;
  completedAt?: string;
  stalledSince?: string;
  notes?: string;
  reason?: string;
};

export type FormationProfilePathway = {
  pathwayId: string;
  pathwayType: string | null;
  startedAt: string | null;
  completedAt: string | null;
  currentStepId: string | null;
  status: "in_progress" | "stalled" | "completed";
  steps: FormationProfileStep[];
};

export type FormationProfile = {
  memberId: string;
  activePathway: FormationProfilePathway | null;
  history: FormationProfilePathway[];
  stalledSteps: FormationProfileStep[];
  lastUpdatedAt: string | null;
};

const initialProfile: FormationProfile = {
  memberId: "",
  activePathway: null,
  history: [],
  stalledSteps: [],
  lastUpdatedAt: null,
};

function upsertStep(
  steps: FormationProfileStep[],
  step: FormationProfileStep
): FormationProfileStep[] {
  const index = steps.findIndex(existing => existing.stepId === step.stepId);

  return index === -1
    ? [...steps, step]
    : steps.map((existing, currentIndex) =>
        currentIndex === index ? { ...existing, ...step } : existing
      );
}

export function applyFormationEventToProfile(
  profile: FormationProfile,
  event: FormationEvent
): FormationProfile {
  switch (event.type) {
    case "PathwayStarted": {
      const activePathway: FormationProfilePathway = {
        pathwayId: event.pathwayId,
        pathwayType: event.payload.pathwayType,
        startedAt: event.payload.startedAt,
        completedAt: null,
        currentStepId: event.payload.initialStepId,
        status: "in_progress",
        steps: [],
      };

      return {
        ...profile,
        memberId: event.memberId,
        activePathway,
        lastUpdatedAt: event.occurredAt,
      };
    }

    case "StepCompleted": {
      if (!profile.activePathway || profile.activePathway.pathwayId !== event.pathwayId) {
        return profile;
      }

      const activePathway: FormationProfilePathway = {
        ...profile.activePathway,
        currentStepId: event.payload.stepId,
        status: "in_progress",
        steps: upsertStep(profile.activePathway.steps, {
          stepId: event.payload.stepId,
          completedAt: event.payload.completedAt,
          notes: event.payload.notes,
        }),
      };

      return { ...profile, activePathway, lastUpdatedAt: event.occurredAt };
    }

    case "StepStalledDetected": {
      if (!profile.activePathway || profile.activePathway.pathwayId !== event.pathwayId) {
        return profile;
      }

      const stalledStep: FormationProfileStep = {
        stepId: event.payload.stepId,
        stalledSince: event.payload.stalledSince,
        reason: event.payload.reason,
      };
      const activePathway: FormationProfilePathway = {
        ...profile.activePathway,
        status: "stalled",
        steps: upsertStep(profile.activePathway.steps, stalledStep),
      };

      return {
        ...profile,
        activePathway,
        stalledSteps: upsertStep(profile.stalledSteps, stalledStep),
        lastUpdatedAt: event.occurredAt,
      };
    }

    case "PathwayCompleted": {
      if (!profile.activePathway || profile.activePathway.pathwayId !== event.pathwayId) {
        return profile;
      }

      const completed: FormationProfilePathway = {
        ...profile.activePathway,
        status: "completed",
        completedAt: event.payload.completedAt,
        currentStepId: event.payload.finalStepId,
      };

      return {
        ...profile,
        activePathway: null,
        history: [...profile.history, completed],
        lastUpdatedAt: event.occurredAt,
      };
    }
  }
}

export function createInitialFormationProfile(memberId: string): FormationProfile {
  return { ...initialProfile, memberId };
}