import type {
  FormationProfile,
  FormationProfilePathway,
  FormationProfileStep
} from "./formationProfile.projection";

export type FormationRecommendation = {
  action: "address_stalled_step" | "continue_pathway" | "start_next_pathway" | "no_recommendation";
  pathwayType: string | null;
  stepId: string | null;
  reason: string;
};

export type FormationCompletionPattern = {
  pathwayType: string;
  completedCount: number;
};

export type FormationIntelligenceResult = {
  memberId: string;
  activePathway: FormationProfilePathway | null;
  stalledSteps: FormationProfileStep[];
  completionPatterns: FormationCompletionPattern[];
  recommendedNextStep: FormationRecommendation;
};

function completionPatterns(profile: FormationProfile): FormationCompletionPattern[] {
  const counts = new Map<string, number>();

  for (const pathway of profile.history) {
    if (!pathway.pathwayType) continue;
    counts.set(pathway.pathwayType, (counts.get(pathway.pathwayType) ?? 0) + 1);
  }

  return Array.from(counts, ([pathwayType, completedCount]) => ({
    pathwayType,
    completedCount
  })).sort((left, right) =>
    right.completedCount - left.completedCount
    || left.pathwayType.localeCompare(right.pathwayType)
  );
}

function recommendation(
  profile: FormationProfile,
  patterns: readonly FormationCompletionPattern[]
): FormationRecommendation {
  const activePathway = profile.activePathway;
  const stalledStep = activePathway?.steps.find((step) => step.stalledSince);

  if (activePathway?.status === "stalled" && stalledStep) {
    return {
      action: "address_stalled_step",
      pathwayType: activePathway.pathwayType,
      stepId: stalledStep.stepId,
      reason: stalledStep.reason
        ? `Address the stalled ${stalledStep.stepId} step: ${stalledStep.reason}.`
        : `Address the stalled ${stalledStep.stepId} step before advancing the pathway.`
    };
  }

  if (activePathway) {
    const priorCompletions = activePathway.pathwayType
      ? patterns.find((pattern) => pattern.pathwayType === activePathway.pathwayType)?.completedCount ?? 0
      : 0;
    const pathwayName = activePathway.pathwayType ?? "active";

    return {
      action: "continue_pathway",
      pathwayType: activePathway.pathwayType,
      stepId: activePathway.currentStepId,
      reason: priorCompletions > 0
        ? `Continue the ${pathwayName} pathway at ${activePathway.currentStepId ?? "the current step"}; this pathway type has ${priorCompletions} prior completion(s).`
        : `Continue the ${pathwayName} pathway at ${activePathway.currentStepId ?? "the current step"}.`
    };
  }

  const mostFrequentCompletion = patterns[0];
  if (mostFrequentCompletion) {
    return {
      action: "start_next_pathway",
      pathwayType: mostFrequentCompletion.pathwayType,
      stepId: null,
      reason: `Discuss the next formation pathway after ${mostFrequentCompletion.completedCount} completed ${mostFrequentCompletion.pathwayType} pathway(s).`
    };
  }

  return {
    action: "no_recommendation",
    pathwayType: null,
    stepId: null,
    reason: "No active or completed formation pathway is available for a next-step recommendation."
  };
}

export class FormationIntelligence {
  public analyze(profile: FormationProfile): FormationIntelligenceResult {
    const patterns = completionPatterns(profile);

    return {
      memberId: profile.memberId,
      activePathway: profile.activePathway
        ? { ...profile.activePathway, steps: profile.activePathway.steps.map((step) => ({ ...step })) }
        : null,
      stalledSteps: profile.stalledSteps.map((step) => ({ ...step })),
      completionPatterns: patterns,
      recommendedNextStep: recommendation(profile, patterns)
    };
  }
}