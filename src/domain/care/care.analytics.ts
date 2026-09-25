import type { CareProfile } from "./careProfile.projection";

export type CareAnalytics = { totalMembers: number; totalCases: number; openCases: number; stalledCases: number; closedCases: number; highPriorityOpenCases: number; unassignedOpenCases: number; closureRate: number };
export function buildCareAnalytics(profiles: readonly CareProfile[]): CareAnalytics {
  const cases = profiles.flatMap((profile) => profile.cases);
  const openCases = cases.filter((careCase) => careCase.status !== "closed");
  const closedCases = cases.filter((careCase) => careCase.status === "closed");
  return { totalMembers: profiles.length, totalCases: cases.length, openCases: openCases.length, stalledCases: cases.filter((careCase) => careCase.status === "stalled").length, closedCases: closedCases.length, highPriorityOpenCases: openCases.filter((careCase) => careCase.priority === "high").length, unassignedOpenCases: openCases.filter((careCase) => !careCase.ownerId).length, closureRate: cases.length ? closedCases.length / cases.length : 0 };
}