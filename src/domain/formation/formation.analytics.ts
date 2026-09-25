import type { FormationProfile } from "./formationProfile.projection";
import type { FormationMilestonesCollection } from "./formation.milestones";
import type {
  FormationTimelineCollection,
  FormationTimelineItem
} from "./formation.timeline";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export type FormationAnalytics = {
  totalPathwaysStarted: number;
  totalPathwaysCompleted: number;
  averagePathwayDuration: number | null;
  averageStepDuration: number | null;
  mostCommonStalledStep: string | null;
  mostCommonCompletedStep: string | null;
  pathwayCompletionRate: number;
  stallRate: number;
  activePathwayCount: number;
  stalledPathwayCount: number;
  completedPathwayCount: number;
};

function durationDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const fromAt = Date.parse(from);
  const toAt = Date.parse(to);
  if (!Number.isFinite(fromAt) || !Number.isFinite(toAt) || toAt < fromAt) {
    return null;
  }
  return (toAt - fromAt) / DAY_IN_MILLISECONDS;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

function mostCommonStep(items: readonly FormationTimelineItem[]): string | null {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.stepId) {
      counts.set(item.stepId, (counts.get(item.stepId) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}

function stepDurations(timelines: readonly FormationTimelineCollection[]): number[] {
  const durations: number[] = [];

  for (const timeline of timelines) {
    const startedAtByPathway = new Map<string, string>();
    const previousCompletionAtByPathway = new Map<string, string>();

    for (const item of timeline.items) {
      if (item.type === "PathwayStarted") {
        startedAtByPathway.set(item.pathwayId, item.occurredAt);
        continue;
      }
      if (item.type !== "StepCompleted") continue;

      const previousAt = previousCompletionAtByPathway.get(item.pathwayId)
        ?? startedAtByPathway.get(item.pathwayId);
      const duration = durationDays(previousAt ?? null, item.occurredAt);
      if (duration !== null) durations.push(duration);
      previousCompletionAtByPathway.set(item.pathwayId, item.occurredAt);
    }
  }

  return durations;
}

export function buildFormationAnalytics(input: {
  profiles: readonly FormationProfile[];
  timelines: readonly FormationTimelineCollection[];
  milestones: readonly FormationMilestonesCollection[];
}): FormationAnalytics {
  const allTimelineItems = input.timelines.flatMap((timeline) => timeline.items);
  const pathwayStarted = allTimelineItems.filter((item) => item.type === "PathwayStarted");
  const pathwayCompleted = allTimelineItems.filter((item) => item.type === "PathwayCompleted");
  const stalledSteps = allTimelineItems.filter((item) => item.type === "StepStalledDetected");
  const completedSteps = allTimelineItems.filter((item) => item.type === "StepCompleted");
  const pathwayDurations = input.profiles
    .flatMap((profile) => profile.history)
    .map((pathway) => durationDays(pathway.startedAt, pathway.completedAt))
    .filter((duration): duration is number => duration !== null);
  const totalStalls = input.milestones.reduce(
    (sum, collection) => sum + collection.milestones.totalStalls,
    0
  );
  const activePathwayCount = input.profiles.filter(
    (profile) => profile.activePathway?.status === "in_progress"
  ).length;
  const stalledPathwayCount = input.profiles.filter(
    (profile) => profile.activePathway?.status === "stalled"
  ).length;
  const completedPathwayCount = input.profiles.reduce(
    (sum, profile) => sum + profile.history.length,
    0
  );

  return {
    totalPathwaysStarted: pathwayStarted.length,
    totalPathwaysCompleted: pathwayCompleted.length,
    averagePathwayDuration: average(pathwayDurations),
    averageStepDuration: average(stepDurations(input.timelines)),
    mostCommonStalledStep: mostCommonStep(stalledSteps),
    mostCommonCompletedStep: mostCommonStep(completedSteps),
    pathwayCompletionRate: pathwayStarted.length
      ? pathwayCompleted.length / pathwayStarted.length
      : 0,
    stallRate: pathwayStarted.length ? totalStalls / pathwayStarted.length : 0,
    activePathwayCount,
    stalledPathwayCount,
    completedPathwayCount
  };
}