import type { FormationInsights } from "../../services/intelligence/pastoralInsightsEngine";
import type { FormationRecommendation } from "./formation.intelligence";
import type { FormationMilestones } from "./formation.milestones";
import type { FormationProfile } from "./formationProfile.projection";
import type { FormationTimelineItem } from "./formation.timeline";

export type FormationCoaching = {
  memberId: string;
  encouragement: string[];
  concerns: string[];
  recommendedNextStep: string | null;
  formationSummary: string;
  coachingPriority: "low" | "medium" | "high";
};

export function getCoachingForMember(
  profile: FormationProfile,
  timeline: readonly FormationTimelineItem[],
  milestones: FormationMilestones,
  insights: FormationInsights,
  recommendation: FormationRecommendation
): FormationCoaching {
  const encouragement: string[] = [];
  const concerns: string[] = [];
  const mostRecentItem = timeline[timeline.length - 1];
  const hasStalledSteps = profile.stalledSteps.length > 0;

  if (hasStalledSteps) {
    concerns.push(`${profile.stalledSteps.length} stalled formation step(s) need attention.`);
  }

  if (insights.longGapsBetweenSteps.detected) {
    concerns.push(
      `${insights.longGapsBetweenSteps.gaps.length} long gap(s) between completed formation steps were detected.`
    );
  }

  if (insights.repeatedStalls.detected) {
    concerns.push(`${insights.repeatedStalls.count} repeated stalls need pastoral follow-up.`);
  }

  if (mostRecentItem?.type === "PathwayCompleted") {
    encouragement.push("A formation pathway was recently completed; affirm the member's progress.");
  }

  if (
    insights.pathwayCompletionVelocity.completedPathwayCount > 0 &&
    insights.pathwayCompletionVelocity.averageDays !== null &&
    insights.pathwayCompletionVelocity.averageDays <= 14
  ) {
    encouragement.push("The member is completing formation pathways at a strong pace.");
  }

  const coachingPriority = hasStalledSteps || insights.repeatedStalls.detected
    ? "high"
    : insights.longGapsBetweenSteps.detected
      ? "medium"
      : "low";
  const recommendedNextStep = recommendation.action === "no_recommendation"
    ? null
    : recommendation.reason;

  return {
    memberId: profile.memberId,
    encouragement,
    concerns,
    recommendedNextStep,
    formationSummary: `${milestones.totalStepsCompleted} step(s) completed, ${milestones.totalStalls} stall(s) detected, and ${milestones.totalPathwaysCompleted} pathway(s) completed.`,
    coachingPriority
  };
}