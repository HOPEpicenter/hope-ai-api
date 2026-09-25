import type { CareInsights } from "./care.insights";
import type { CareRecommendation } from "./care.intelligence";
import type { CareMilestones } from "./care.milestones";
import type { CareProfile } from "./careProfile.projection";

export type CareCoaching = { memberId: string; coachingPriority: "low" | "medium" | "high"; encouragement: string[]; concerns: string[]; recommendedNextStep: string | null; careSummary: string };
export function getCareCoaching(profile: CareProfile, milestones: CareMilestones, insights: CareInsights, recommendation: CareRecommendation): CareCoaching {
  const concerns: string[] = [];
  if (insights.stalledCaseCount) concerns.push(`${insights.stalledCaseCount} care case(s) are stalled.`);
  if (insights.unassignedOpenCaseCount) concerns.push(`${insights.unassignedOpenCaseCount} open care case(s) need an owner.`);
  const encouragement = milestones.totalCasesClosed ? ["Care follow-through has resulted in a closed case."] : [];
  return { memberId: profile.memberId, coachingPriority: insights.stalledCaseCount || insights.highPriorityOpenCaseCount ? "high" : insights.unassignedOpenCaseCount ? "medium" : "low", encouragement, concerns, recommendedNextStep: recommendation.action === "no_recommendation" ? null : recommendation.reason, careSummary: `${insights.openCaseCount} open case(s), ${insights.stalledCaseCount} stalled, and ${insights.closedCaseCount} closed.` };
}