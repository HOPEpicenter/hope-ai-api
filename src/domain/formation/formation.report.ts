import type { FormationAnalytics } from "./formation.analytics";
import type { FormationCoaching } from "./formation.coaching";
import type { FormationMilestones } from "./formation.milestones";
import type { FormationProfile } from "./formationProfile.projection";
import type { FormationTimelineItem } from "./formation.timeline";

export type FormationJourneyReport = {
  memberId: string;
  pathways: {
    started: number;
    completed: number;
  };
  keyMilestones: FormationMilestones;
  stalls: {
    total: number;
    items: FormationTimelineItem[];
    recoveries: Array<{
      pathwayId: string;
      stepId: string;
      stalledAt: string;
      recoveredAt: string;
    }>;
  };
  coaching: {
    priority: FormationCoaching["coachingPriority"];
    summary: string;
    recommendedNextStep: string | null;
    encouragement: string[];
    concerns: string[];
  };
  analyticsHighlights: Pick<
    FormationAnalytics,
    | "averagePathwayDuration"
    | "averageStepDuration"
    | "pathwayCompletionRate"
    | "stallRate"
    | "activePathwayCount"
    | "stalledPathwayCount"
    | "completedPathwayCount"
  >;
};

function recoveriesFromTimeline(
  timeline: readonly FormationTimelineItem[]
): FormationJourneyReport["stalls"]["recoveries"] {
  const stalledAtByStep = new Map<string, FormationTimelineItem>();
  const recoveries: FormationJourneyReport["stalls"]["recoveries"] = [];

  for (const item of timeline) {
    if (!item.stepId) continue;
    const key = `${item.pathwayId}:${item.stepId}`;

    if (item.type === "StepStalledDetected") {
      stalledAtByStep.set(key, item);
    }
    if (item.type === "StepCompleted") {
      const stalled = stalledAtByStep.get(key);
      if (stalled) {
        recoveries.push({
          pathwayId: item.pathwayId,
          stepId: item.stepId,
          stalledAt: stalled.occurredAt,
          recoveredAt: item.occurredAt
        });
        stalledAtByStep.delete(key);
      }
    }
  }

  return recoveries;
}

export function generateFormationJourneyReport(input: {
  memberId: string;
  profile: FormationProfile;
  timeline: readonly FormationTimelineItem[];
  milestones: FormationMilestones;
  coaching: FormationCoaching;
  analytics: FormationAnalytics;
}): FormationJourneyReport {
  const stalls = input.timeline.filter((item) => item.type === "StepStalledDetected");

  return {
    memberId: input.memberId,
    pathways: {
      started: input.milestones.pathwayStarted.length,
      completed: input.milestones.totalPathwaysCompleted
    },
    keyMilestones: input.milestones,
    stalls: {
      total: stalls.length,
      items: stalls,
      recoveries: recoveriesFromTimeline(input.timeline)
    },
    coaching: {
      priority: input.coaching.coachingPriority,
      summary: input.coaching.formationSummary,
      recommendedNextStep: input.coaching.recommendedNextStep,
      encouragement: input.coaching.encouragement,
      concerns: input.coaching.concerns
    },
    analyticsHighlights: {
      averagePathwayDuration: input.analytics.averagePathwayDuration,
      averageStepDuration: input.analytics.averageStepDuration,
      pathwayCompletionRate: input.analytics.pathwayCompletionRate,
      stallRate: input.analytics.stallRate,
      activePathwayCount: input.analytics.activePathwayCount,
      stalledPathwayCount: input.analytics.stalledPathwayCount,
      completedPathwayCount: input.analytics.completedPathwayCount
    }
  };
}