import type { CareInsights } from "./care.insights";
import type { CareProfile } from "./careProfile.projection";

export type CareAlert = { memberId: string; caseId: string; signalType: "CareCaseStalled" | "HighPriorityCareCase" | "UnassignedCareCase"; severity: "medium" | "high"; message: string };
export function buildCareAlerts(profile: CareProfile, insights: CareInsights): CareAlert[] {
  const alerts: CareAlert[] = [];
  for (const careCase of profile.cases) {
    if (careCase.status === "stalled") alerts.push({ memberId: profile.memberId, caseId: careCase.caseId, signalType: "CareCaseStalled", severity: "high", message: "Care case is stalled." });
    if (careCase.status !== "closed" && careCase.priority === "high") alerts.push({ memberId: profile.memberId, caseId: careCase.caseId, signalType: "HighPriorityCareCase", severity: "high", message: "High-priority care case is active." });
    if (careCase.status !== "closed" && !careCase.ownerId) alerts.push({ memberId: profile.memberId, caseId: careCase.caseId, signalType: "UnassignedCareCase", severity: "medium", message: "Open care case has no owner." });
  }
  return insights.needsAttention ? alerts : [];
}