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

export type ActivityFormationCohortSummary = {
  connectedWithoutNextStep: number;
  connectedWithoutCareOwner: number;
  nextStepSelectedNotCompleted: number;
  activeCareWithoutOutcome: number;
};

export type ActivityFormationOpportunity = {
  key:
    | "CONNECTED_WITHOUT_NEXT_STEP"
    | "ACTIVE_CARE_WITHOUT_OUTCOME"
    | "NEXT_STEP_SELECTED_NOT_COMPLETED"
    | "CONNECTED_WITHOUT_CARE_OWNER";
  label: string;
  count: number;
  priority: "high" | "medium" | "low";
  drilldown: {
    surface: "formation-profiles" | "followups" | "care-queue";
    segment: string;
    href: string;
  };
};

export type ActivityFormationOpportunitySummary = {
  highestPriority: ActivityFormationOpportunity | null;
  items: ActivityFormationOpportunity[];
};

export type ActivityFormationSummary = {
  totalProfiles: number;
  byStage: Record<string, number>;
  projectedJourney: ActivityFormationJourneySummary;
  milestoneSignals: ActivityFormationMilestoneSummary;
  cohorts: ActivityFormationCohortSummary;
  opportunities: ActivityFormationOpportunitySummary;
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

function buildFormationOpportunities(
  cohorts: ActivityFormationCohortSummary
): ActivityFormationOpportunitySummary {
  const items = [
    {
      key: "CONNECTED_WITHOUT_NEXT_STEP",
      label: "Connected people without next step",
      count: cohorts.connectedWithoutNextStep,
      priority: "high",
      drilldown: {
        surface: "formation-profiles",
        segment: "connected-without-next-step",
        href: "/formation-profiles?segment=connected-without-next-step"
      }
    },
    {
      key: "ACTIVE_CARE_WITHOUT_OUTCOME",
      label: "Active care relationships without outcome",
      count: cohorts.activeCareWithoutOutcome,
      priority: "high",
      drilldown: {
        surface: "followups",
        segment: "active-care-without-outcome",
        href: "/followups?segment=active-care-without-outcome"
      }
    },
    {
      key: "NEXT_STEP_SELECTED_NOT_COMPLETED",
      label: "Next steps selected but not completed",
      count: cohorts.nextStepSelectedNotCompleted,
      priority: "medium",
      drilldown: {
        surface: "formation-profiles",
        segment: "next-step-selected-not-completed",
        href: "/formation-profiles?segment=next-step-selected-not-completed"
      }
    },
    {
      key: "CONNECTED_WITHOUT_CARE_OWNER",
      label: "Connected people without care owner",
      count: cohorts.connectedWithoutCareOwner,
      priority: "medium",
      drilldown: {
        surface: "care-queue",
        segment: "connected-without-care-owner",
        href: "/followups?segment=connected-without-care-owner"
      }
    }
  ] satisfies ActivityFormationOpportunity[];

  const filtered = items.filter((item) => item.count > 0);

  return {
    highestPriority: filtered[0] ?? null,
    items: filtered
  };
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

  const cohorts: ActivityFormationCohortSummary = {
    connectedWithoutNextStep: 0,
    connectedWithoutCareOwner: 0,
    nextStepSelectedNotCompleted: 0,
    activeCareWithoutOutcome: 0
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

    if (stage === "Connected" && !hasNextStep) {
      cohorts.connectedWithoutNextStep++;
    }

    if (stage === "Connected" && !hasCareOwner) {
      cohorts.connectedWithoutCareOwner++;
    }

    if (hasNextStep && !hasCompletedNextStep) {
      cohorts.nextStepSelectedNotCompleted++;
    }

    if (hasCareOwner && !hasText(profile.lastFollowupOutcomeAt)) {
      cohorts.activeCareWithoutOutcome++;
    }

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
    milestoneSignals,
    cohorts,
    opportunities: buildFormationOpportunities(cohorts)
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

