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

export type ActivityFormationProjectionInput = {
  stage?: string | null;
  assignedTo?: string | null;
  lastNextStepAt?: string | null;
  lastNextStepCompletedAt?: string | null;
  lastFollowupOutcome?: string | null;
  lastFollowupOutcomeAt?: string | null;
  groups?: unknown;
  groupsJson?: string | null;
};

export type ActivityFormationJourneySummary = {
  guest: number;
  connected: number;
  growing: number;
  serving: number;
  member: number;
};

export type ActivityFormationMilestoneSummary = {
  nextStepSelected: number;
  nextStepCompleted: number;
  connectedOutcomes: number;
  activeCareRelationships: number;
  groupParticipation: number;
};

export type ActivityFormationSummary = {
  totalProfiles: number;
  byStage: Record<string, number>;
  projectedJourney: ActivityFormationJourneySummary;
  milestoneSignals: ActivityFormationMilestoneSummary;
};

export type ActivityIntelligenceInput = {
  careSummary: ActivityCareLoadSummary;
  followupStats: ActivityFollowupStats;
  formationProfiles: ActivityFormationProjectionInput[];
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

const CONNECTED_OUTCOMES = new Set([
  "connected",
  "will_visit",
  "visiting",
  "attending",
  "next_step_taken",
  "joined_group",
  "member_class",
  "baptism_class"
]);

function addStage(byStage: Record<string, number>, rawStage: unknown): void {
  const stage = String(rawStage ?? "Unknown").trim() || "Unknown";
  byStage[stage] = (byStage[stage] ?? 0) + 1;
}

function hasText(value: unknown): boolean {
  return String(value ?? "").trim().length > 0;
}

function normalizeOutcome(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasGroupParticipation(profile: ActivityFormationProjectionInput): boolean {
  if (Array.isArray(profile.groups) && profile.groups.length > 0) {
    return true;
  }

  const groupsJson = String(profile.groupsJson ?? "").trim();
  if (!groupsJson) {
    return false;
  }

  try {
    const groups = JSON.parse(groupsJson);
    return Array.isArray(groups) && groups.length > 0;
  } catch {
    return false;
  }
}

function buildFormationSummary(
  profiles: ActivityFormationProjectionInput[]
): ActivityFormationSummary {
  const byStage: Record<string, number> = {};
  const projectedJourney: ActivityFormationJourneySummary = {
    guest: 0,
    connected: 0,
    growing: 0,
    serving: 0,
    member: 0
  };
  const milestoneSignals: ActivityFormationMilestoneSummary = {
    nextStepSelected: 0,
    nextStepCompleted: 0,
    connectedOutcomes: 0,
    activeCareRelationships: 0,
    groupParticipation: 0
  };

  for (const profile of profiles) {
    addStage(byStage, profile.stage);

    const stage = String(profile.stage ?? "").trim();
    const outcome = normalizeOutcome(profile.lastFollowupOutcome);
    const hasNextStep = hasText(profile.lastNextStepAt);
    const hasCompletedNextStep = hasText(profile.lastNextStepCompletedAt);
    const hasConnectedOutcome =
      hasText(profile.lastFollowupOutcomeAt) &&
      CONNECTED_OUTCOMES.has(outcome);
    const hasCareOwner = hasText(profile.assignedTo);
    const hasGroups = hasGroupParticipation(profile);

    if (hasNextStep) {
      milestoneSignals.nextStepSelected++;
    }

    if (hasCompletedNextStep) {
      milestoneSignals.nextStepCompleted++;
    }

    if (hasConnectedOutcome) {
      milestoneSignals.connectedOutcomes++;
    }

    if (hasCareOwner) {
      milestoneSignals.activeCareRelationships++;
    }

    if (hasGroups) {
      milestoneSignals.groupParticipation++;
    }

    if (stage === "Guest" || stage === "Visitor" || stage === "Unknown" || !stage) {
      projectedJourney.guest++;
    }

    if (stage === "Connected" || hasConnectedOutcome || hasNextStep) {
      projectedJourney.connected++;
    }

    if (hasCompletedNextStep || hasGroups) {
      projectedJourney.growing++;
    }

    if (hasGroups || outcome === "joined_group") {
      projectedJourney.serving++;
    }

    if (outcome === "member_class") {
      projectedJourney.member++;
    }
  }

  return {
    totalProfiles: profiles.length,
    byStage,
    projectedJourney,
    milestoneSignals
  };
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

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    operationalHealth: {
      status,
      reasons
    },
    careLoad: input.careSummary,
    followups: input.followupStats,
    formation: buildFormationSummary(input.formationProfiles)
  };
}
