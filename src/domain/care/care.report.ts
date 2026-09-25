import type { CareAnalytics } from "./care.analytics";
import type { CareCoaching } from "./care.coaching";
import type { CareMilestones } from "./care.milestones";
import type { CareProfile } from "./careProfile.projection";
import type { CareTimelineItem } from "./care.timeline";

export type CareJourneyReport = { memberId: string; cases: { started: number; closed: number; active: number; stalled: number }; milestones: CareMilestones; coaching: CareCoaching; timeline: CareTimelineItem[]; analyticsHighlights: Pick<CareAnalytics, "closureRate" | "highPriorityOpenCases" | "unassignedOpenCases"> };
export function generateCareJourneyReport(input: { profile: CareProfile; timeline: readonly CareTimelineItem[]; milestones: CareMilestones; coaching: CareCoaching; analytics: CareAnalytics }): CareJourneyReport {
  return { memberId: input.profile.memberId, cases: { started: input.milestones.totalCasesStarted, closed: input.milestones.totalCasesClosed, active: input.profile.activeCaseIds.length, stalled: input.profile.stalledCaseIds.length }, milestones: input.milestones, coaching: input.coaching, timeline: [...input.timeline], analyticsHighlights: { closureRate: input.analytics.closureRate, highPriorityOpenCases: input.analytics.highPriorityOpenCases, unassignedOpenCases: input.analytics.unassignedOpenCases } };
}