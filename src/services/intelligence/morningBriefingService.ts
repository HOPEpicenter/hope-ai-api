import type { ActivityIntelligenceResult } from "./activityIntelligenceService";

export const MORNING_BRIEFING_SCHEMA_VERSION = 1 as const;

export type MorningBriefingSourceStatus = "available" | "unavailable";
export type MorningBriefingDecisionStatus = "attention" | "watch" | "clear" | "unavailable";
export type MorningBriefingActionPriority = "urgent" | "high" | "medium";

export type MorningBriefingAction = {
  key: string;
  priority: MorningBriefingActionPriority;
  label: string;
  reason: string;
  source: "care-summary" | "activity-intelligence";
  sourcePath: string;
  count: number;
};

export type MorningBriefing = {
  schemaVersion: typeof MORNING_BRIEFING_SCHEMA_VERSION;
  generatedAt: string;
  complete: boolean;
  sources: {
    careSummary: MorningBriefingSourceStatus;
    followups: MorningBriefingSourceStatus;
    activityIntelligence: MorningBriefingSourceStatus;
    opportunitySignals: MorningBriefingSourceStatus;
  };
  decision: {
    status: MorningBriefingDecisionStatus;
    firstAction: MorningBriefingAction | null;
    actions: MorningBriefingAction[];
  };
  care: {
    urgentCount: number;
    unassignedCount: number;
  };
  followups: {
    total: number;
    overdue: number;
    atRisk: number;
  };
  activity: {
    operationalHealth: ActivityIntelligenceResult["operationalHealth"];
    formation: Pick<ActivityIntelligenceResult["formation"], "totalProfiles" | "opportunities">;
  };
  ownership: {
    assignedCount: number;
    unassignedCount: number;
    ownedCount: number;
    queueCount: number;
  };
};

export type MorningBriefingCompositionInput = {
  intelligence: ActivityIntelligenceResult;
  generatedAt?: string;
  sourceStatus?: Partial<MorningBriefing["sources"]>;
};

function action(
  key: string,
  priority: MorningBriefingActionPriority,
  label: string,
  reason: string,
  source: MorningBriefingAction["source"],
  sourcePath: string,
  count: number
): MorningBriefingAction {
  return { key, priority, label, reason, source, sourcePath, count };
}

export function composeMorningBriefing(
  input: MorningBriefingCompositionInput
): MorningBriefing {
  const { intelligence } = input;
  const sources = {
    careSummary: input.sourceStatus?.careSummary ?? "available",
    followups: input.sourceStatus?.followups ?? "available",
    activityIntelligence: input.sourceStatus?.activityIntelligence ?? "available",
    opportunitySignals: input.sourceStatus?.opportunitySignals ?? "available"
  };
  const complete = Object.values(sources).every((status) => status === "available");
  const actions: MorningBriefingAction[] = [];

  if (intelligence.careLoad.urgentCount > 0) {
    actions.push(action(
      "urgent-care",
      "urgent",
      "Contact people needing urgent care",
      `${intelligence.careLoad.urgentCount} urgent care candidate(s) are in the canonical care summary.`,
      "care-summary",
      "/api/care/summary",
      intelligence.careLoad.urgentCount
    ));
  }

  if (intelligence.followups.overdue > 0) {
    actions.push(action(
      "overdue-followups",
      "urgent",
      "Review overdue follow-ups",
      `${intelligence.followups.overdue} follow-up(s) are overdue in the canonical follow-up narrative.`,
      "activity-intelligence",
      "/api/activity-intelligence",
      intelligence.followups.overdue
    ));
  }

  if (intelligence.careLoad.unassignedCount > 0) {
    actions.push(action(
      "unassigned-care",
      "high",
      "Assign care ownership",
      `${intelligence.careLoad.unassignedCount} care candidate(s) do not have an assigned owner.`,
      "care-summary",
      "/api/care/summary",
      intelligence.careLoad.unassignedCount
    ));
  }

  if (intelligence.followups.atRisk > 0) {
    actions.push(action(
      "at-risk-followups",
      "high",
      "Review at-risk follow-ups",
      `${intelligence.followups.atRisk} follow-up(s) are at risk in the canonical follow-up narrative.`,
      "activity-intelligence",
      "/api/activity-intelligence",
      intelligence.followups.atRisk
    ));
  }

  for (const opportunity of intelligence.formation.opportunities.items) {
    actions.push(action(
      `opportunity-${opportunity.key.toLowerCase()}`,
      opportunity.priority === "high" ? "high" : "medium",
      `Review ${opportunity.label}`,
      `${opportunity.count} person(s) match the canonical ${opportunity.label.toLowerCase()} opportunity signal.`,
      "activity-intelligence",
      "/api/activity-intelligence",
      opportunity.count
    ));
  }

  const decisionStatus: MorningBriefingDecisionStatus = !complete
    ? "unavailable"
    : intelligence.operationalHealth.status === "attention"
      ? "attention"
      : intelligence.operationalHealth.status === "watch"
        ? "watch"
        : actions.length > 0
          ? "watch"
          : "clear";

  return {
    schemaVersion: MORNING_BRIEFING_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? intelligence.generatedAt,
    complete,
    sources,
    decision: {
      status: decisionStatus,
      firstAction: complete ? actions[0] ?? null : null,
      actions: complete ? actions : []
    },
    care: {
      urgentCount: intelligence.careLoad.urgentCount,
      unassignedCount: intelligence.careLoad.unassignedCount
    },
    followups: {
      total: intelligence.followups.total,
      overdue: intelligence.followups.overdue,
      atRisk: intelligence.followups.atRisk
    },
    activity: {
      operationalHealth: intelligence.operationalHealth,
      formation: {
        totalProfiles: intelligence.formation.totalProfiles,
        opportunities: intelligence.formation.opportunities
      }
    },
    ownership: {
      assignedCount: intelligence.careLoad.assignedCount,
      unassignedCount: intelligence.careLoad.unassignedCount,
      ownedCount: intelligence.careLoad.ownedCount,
      queueCount: intelligence.careLoad.queueCount
    }
  };
}