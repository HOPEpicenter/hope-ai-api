import type { CareProfile } from "./careProfile.projection";

export type CareInsights = { memberId: string; openCaseCount: number; stalledCaseCount: number; closedCaseCount: number; unassignedOpenCaseCount: number; highPriorityOpenCaseCount: number; needsAttention: boolean };
export function buildCareInsights(profile: CareProfile): CareInsights {
  const openCases = profile.cases.filter((careCase) => careCase.status !== "closed");
  const stalledCaseCount = profile.stalledCaseIds.length;
  const highPriorityOpenCaseCount = openCases.filter((careCase) => careCase.priority === "high").length;
  return { memberId: profile.memberId, openCaseCount: openCases.length, stalledCaseCount, closedCaseCount: profile.closedCaseIds.length, unassignedOpenCaseCount: openCases.filter((careCase) => !careCase.ownerId).length, highPriorityOpenCaseCount, needsAttention: stalledCaseCount > 0 || highPriorityOpenCaseCount > 0 };
}