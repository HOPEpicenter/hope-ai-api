import type { CareInsights } from "./care.insights";
import type { CareProfile } from "./careProfile.projection";

export type CareRecommendation = { memberId: string; action: "address_stalled_case" | "assign_owner" | "continue_care" | "no_recommendation"; caseId: string | null; reason: string };
export function buildCareRecommendation(profile: CareProfile, insights: CareInsights): CareRecommendation {
  const stalled = profile.cases.find((careCase) => careCase.status === "stalled");
  if (stalled) return { memberId: profile.memberId, action: "address_stalled_case", caseId: stalled.caseId, reason: "A care case is stalled and needs follow-up." };
  const unassigned = profile.cases.find((careCase) => careCase.status !== "closed" && !careCase.ownerId);
  if (unassigned) return { memberId: profile.memberId, action: "assign_owner", caseId: unassigned.caseId, reason: "An open care case has no assigned owner." };
  const open = profile.cases.find((careCase) => careCase.status === "open");
  if (open) return { memberId: profile.memberId, action: "continue_care", caseId: open.caseId, reason: "An active care case should receive its next follow-up." };
  return { memberId: profile.memberId, action: "no_recommendation", caseId: null, reason: insights.closedCaseCount ? "All care cases are closed." : "No care cases are available." };
}