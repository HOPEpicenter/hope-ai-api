export type ActivityOperationalHealthStatus = "healthy" | "watch" | "attention";

export type ActivityCareLoadSummary = {
  totalCandidates: number;
  urgentCount: number;
  staleCount: number;
  escalationCount: number;
  assignedCount: number;
  unassignedCount: number;
  ownedCount: number;
  queueCount: number;
};

export type ActivityFollowupStats = {
  total: number;
  resolved: number;
  escalated: number;
  overdue: number;
  atRisk: number;
  onTrack: number;
};

export type ActivityFormationSummary = {
  totalProfiles: number;
  byStage: Record<string, number>;
};

export type ActivityIntelligenceInput = {
  careSummary: ActivityCareLoadSummary;
  followupStats: ActivityFollowupStats;
  formationProfiles: Array<{ stage?: string | null }>;
  generatedAt?: string;
};

export type ActivityIntelligenceResult = {
  generatedAt: string;
  operationalHealth: {
    status: ActivityOperationalHealthStatus;
    reasons: string[];
  };
  careLoad: ActivityCareLoadSummary;
  followups: ActivityFollowupStats;
  formation: ActivityFormationSummary;
};

function addStage(byStage: Record<string, number>, rawStage: unknown): void {
  const stage = String(rawStage ?? "Unknown").trim() || "Unknown";
  byStage[stage] = (byStage[stage] ?? 0) + 1;
}

export function buildActivityIntelligence(
  input: ActivityIntelligenceInput
): ActivityIntelligenceResult {
  const reasons: string[] = [];

  if (input.followupStats.overdue > 0) {
    reasons.push(`${input.followupStats.overdue} overdue followup(s)`);
  }

  if (input.careSummary.escalationCount > 0) {
    reasons.push(`${input.careSummary.escalationCount} care escalation(s)`);
  }

  if (input.careSummary.urgentCount > 0) {
    reasons.push(`${input.careSummary.urgentCount} urgent care candidate(s)`);
  }

  if (input.careSummary.staleCount > 0) {
    reasons.push(`${input.careSummary.staleCount} stale care candidate(s)`);
  }

  if (input.followupStats.atRisk > 0) {
    reasons.push(`${input.followupStats.atRisk} at-risk followup(s)`);
  }

  const status: ActivityOperationalHealthStatus =
    input.followupStats.overdue > 0 ||
    input.careSummary.escalationCount > 0 ||
    input.careSummary.urgentCount > 0
      ? "attention"
      : input.careSummary.staleCount > 0 || input.followupStats.atRisk > 0
        ? "watch"
        : "healthy";

  const byStage: Record<string, number> = {};
  for (const profile of input.formationProfiles) {
    addStage(byStage, profile.stage);
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    operationalHealth: {
      status,
      reasons
    },
    careLoad: input.careSummary,
    followups: input.followupStats,
    formation: {
      totalProfiles: input.formationProfiles.length,
      byStage
    }
  };
}
