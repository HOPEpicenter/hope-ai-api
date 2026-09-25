import type { FormationTimelineItem } from "./formation.timeline";

export type FormationStepCompletionMilestone = FormationTimelineItem & {
  durationDays: number;
};

export type FormationMilestones = {
  pathwayStarted: FormationTimelineItem[];
  firstStepCompleted: FormationTimelineItem[];
  stalledStepDetected: FormationTimelineItem[];
  pathwayCompleted: FormationTimelineItem[];
  fastestStepCompletion: FormationStepCompletionMilestone | null;
  longestStepCompletion: FormationStepCompletionMilestone | null;
  totalStepsCompleted: number;
  totalStalls: number;
  totalPathwaysCompleted: number;
};

export type FormationMilestonesCollection = {
  memberId: string;
  milestones: FormationMilestones;
};

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function durationDays(from: string, to: string): number | null {
  const fromAt = Date.parse(from);
  const toAt = Date.parse(to);
  if (!Number.isFinite(fromAt) || !Number.isFinite(toAt) || toAt < fromAt) {
    return null;
  }
  return Math.floor((toAt - fromAt) / DAY_IN_MILLISECONDS);
}

export function buildFormationMilestones(
  timeline: readonly FormationTimelineItem[]
): FormationMilestones {
  const pathwayStarted = timeline.filter((item) => item.type === "PathwayStarted");
  const stalledStepDetected = timeline.filter((item) => item.type === "StepStalledDetected");
  const pathwayCompleted = timeline.filter((item) => item.type === "PathwayCompleted");
  const startedAtByPathway = new Map(
    pathwayStarted.map((item) => [item.pathwayId, item.occurredAt])
  );
  const firstStepCompleted: FormationTimelineItem[] = [];
  const completedPathways = new Set<string>();
  const completionMilestones: FormationStepCompletionMilestone[] = [];
  const previousCompletionAtByPathway = new Map<string, string>();

  for (const item of timeline) {
    if (item.type !== "StepCompleted") continue;

    if (!completedPathways.has(item.pathwayId)) {
      firstStepCompleted.push(item);
      completedPathways.add(item.pathwayId);
    }

    const previousAt = previousCompletionAtByPathway.get(item.pathwayId)
      ?? startedAtByPathway.get(item.pathwayId);
    if (previousAt) {
      const elapsedDays = durationDays(previousAt, item.occurredAt);
      if (elapsedDays !== null) {
        completionMilestones.push({ ...item, durationDays: elapsedDays });
      }
    }
    previousCompletionAtByPathway.set(item.pathwayId, item.occurredAt);
  }

  const byFastest = completionMilestones.slice().sort((left, right) =>
    left.durationDays - right.durationDays
    || left.occurredAt.localeCompare(right.occurredAt)
  );
  const byLongest = completionMilestones.slice().sort((left, right) =>
    right.durationDays - left.durationDays
    || left.occurredAt.localeCompare(right.occurredAt)
  );

  return {
    pathwayStarted,
    firstStepCompleted,
    stalledStepDetected,
    pathwayCompleted,
    fastestStepCompletion: byFastest[0] ?? null,
    longestStepCompletion: byLongest[0] ?? null,
    totalStepsCompleted: completedPathways.size === 0
      ? 0
      : timeline.filter((item) => item.type === "StepCompleted").length,
    totalStalls: stalledStepDetected.length,
    totalPathwaysCompleted: pathwayCompleted.length
  };
}