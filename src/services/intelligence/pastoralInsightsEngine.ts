import { FormationProfileIndex } from "../../domain/formation/formationProfile.index";
import type {
  FormationProfilePathway,
  FormationProfileStep
} from "../../domain/formation/formationProfile.projection";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export type FormationInsightThresholds = {
  slowProgressDays: number;
  longGapDays: number;
  repeatedStallCount: number;
};

export type FormationInsights = {
  memberId: string;
  stalledSteps: FormationProfileStep[];
  slowProgress: {
    detected: boolean;
    daysInActivePathway: number | null;
  };
  repeatedStalls: {
    detected: boolean;
    count: number;
  };
  longGapsBetweenSteps: {
    detected: boolean;
    gaps: Array<{
      fromStepId: string;
      toStepId: string;
      days: number;
    }>;
  };
  pathwayCompletionVelocity: {
    completedPathwayCount: number;
    averageDays: number | null;
    latestDays: number | null;
  };
};

export type PastoralInsightsOptions = Partial<FormationInsightThresholds> & {
  asOf?: string;
};

const defaultThresholds: FormationInsightThresholds = {
  slowProgressDays: 30,
  longGapDays: 14,
  repeatedStallCount: 2
};

function daysBetween(earlier: string, later: string): number | null {
  const earlierAt = Date.parse(earlier);
  const laterAt = Date.parse(later);
  if (!Number.isFinite(earlierAt) || !Number.isFinite(laterAt) || laterAt < earlierAt) {
    return null;
  }
  return Math.floor((laterAt - earlierAt) / DAY_IN_MILLISECONDS);
}

function longGaps(
  pathway: FormationProfilePathway | null,
  longGapDays: number
): FormationInsights["longGapsBetweenSteps"]["gaps"] {
  if (!pathway) return [];

  const completedSteps = pathway.steps
    .filter((step): step is FormationProfileStep & { completedAt: string } => Boolean(step.completedAt))
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  const gaps: FormationInsights["longGapsBetweenSteps"]["gaps"] = [];

  for (let index = 1; index < completedSteps.length; index++) {
    const earlier = completedSteps[index - 1]!;
    const later = completedSteps[index]!;
    const days = daysBetween(earlier.completedAt, later.completedAt);
    if (days !== null && days >= longGapDays) {
      gaps.push({ fromStepId: earlier.stepId, toStepId: later.stepId, days });
    }
  }

  return gaps;
}

function completionVelocity(history: readonly FormationProfilePathway[]) {
  const durations = history
    .map((pathway) => {
      if (!pathway.startedAt || !pathway.completedAt) return null;
      return daysBetween(pathway.startedAt, pathway.completedAt);
    })
    .filter((duration): duration is number => duration !== null);

  return {
    completedPathwayCount: durations.length,
    averageDays: durations.length
      ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
      : null,
    latestDays: durations.length ? durations[durations.length - 1]! : null
  };
}

export class PastoralInsightsEngine {
  constructor(private readonly formationProfiles: FormationProfileIndex) {}

  public getAllFormationInsights(
    options: PastoralInsightsOptions = {}
  ): FormationInsights[] {
    return this.formationProfiles
      .getAllProfiles()
      .map((profile) => this.getFormationInsights(profile.memberId, options));
  }

  public getFormationInsights(
    memberId: string,
    options: PastoralInsightsOptions = {}
  ): FormationInsights {
    const profile = this.formationProfiles.getProfile(memberId);
    const thresholds = { ...defaultThresholds, ...options };
    const stalledSteps = profile?.stalledSteps ?? [];
    const asOf = options.asOf ?? new Date().toISOString();
    const activePathway = profile?.activePathway ?? null;
    const daysInActivePathway = activePathway?.startedAt
      ? daysBetween(activePathway.startedAt, asOf)
      : null;
    const gaps = longGaps(activePathway, thresholds.longGapDays);

    return {
      memberId,
      stalledSteps,
      slowProgress: {
        detected: daysInActivePathway !== null && daysInActivePathway >= thresholds.slowProgressDays,
        daysInActivePathway
      },
      repeatedStalls: {
        detected: stalledSteps.length >= thresholds.repeatedStallCount,
        count: stalledSteps.length
      },
      longGapsBetweenSteps: {
        detected: gaps.length > 0,
        gaps
      },
      pathwayCompletionVelocity: completionVelocity(profile?.history ?? [])
    };
  }
}