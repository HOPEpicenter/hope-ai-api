import type { ActivityIntelligenceResult } from "./activityIntelligenceService";
import type {
  CanonicalMorningBriefingCareCandidate
} from "./readCanonicalActivityIntelligence";
import { FormationProfileIndex } from "../../domain/formation/formationProfile.index";
import type {
  FormationProfilePathway,
  FormationProfileStep
} from "../../domain/formation/formationProfile.projection";

export const MORNING_BRIEFING_SCHEMA_VERSION = 1 as const;
export const MORNING_BRIEFING_CARE_TARGET_LIMIT = 5 as const;

export type MorningBriefingSourceStatus = "available" | "unavailable";
export type MorningBriefingDecisionStatus = "attention" | "watch" | "clear" | "unavailable";
export type MorningBriefingActionPriority = "urgent" | "high" | "medium";
export type MorningBriefingCareLaneKey =
  | "urgent-care"
  | "unassigned-care"
  | "shared-care-queue";

export type MorningBriefingCareTarget = {
  visitorId: string;
  displayName: string;
  reason: string;
  personPath: string;
};

export type MorningBriefingCareLane = {
  key: MorningBriefingCareLaneKey;
  label: string;
  count: number;
  targets: MorningBriefingCareTarget[];
  additionalTargetCount: number;
};

export type MorningBriefingAction = {
  key: string;
  priority: MorningBriefingActionPriority;
  label: string;
  reason: string;
  source: "care-summary" | "activity-intelligence";
  sourcePath: string;
  count: number;
  primaryTarget?: MorningBriefingCareTarget;
};

export type TodayCareSummary = {
  peopleNeedingCare: number;
  /** Urgent, elevated, or unassigned care candidates; counted once. */
  needsAttentionToday: number;
  urgentCare: number;
};

export type FormationBriefingPathway = FormationProfilePathway & {
  memberId: string;
};

export type FormationBriefingStep = FormationProfileStep & {
  memberId: string;
};

export type FormationBriefingCard = {
  activePathways: FormationBriefingPathway[];
  stalledSteps: FormationBriefingStep[];
  completedPathways: FormationBriefingPathway[];
  nextRecommendedStep: string | null;
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
  todayCareSummary: TodayCareSummary | null;
  care: {
    urgentCount: number;
    unassignedCount: number;
    lanes: MorningBriefingCareLane[];
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
  formation: FormationBriefingCard;
  ownership: {
    assignedCount: number;
    unassignedCount: number;
    ownedCount: number;
    queueCount: number;
  };
};

export type MorningBriefingCompositionInput = {
  intelligence: ActivityIntelligenceResult;
  careCandidates?: readonly CanonicalMorningBriefingCareCandidate[];
  formationProfileIndex?: FormationProfileIndex;
  generatedAt?: string;
  sourceStatus?: Partial<MorningBriefing["sources"]>;
};

function toCareTarget(
  candidate: CanonicalMorningBriefingCareCandidate
): MorningBriefingCareTarget {
  return {
    visitorId: candidate.visitorId,
    displayName: candidate.displayName,
    reason: "Needs care",
    personPath: `/people?visitorId=${encodeURIComponent(candidate.visitorId)}`
  };
}

export function buildFormationBriefingCard(
  formationProfileIndex?: FormationProfileIndex
): FormationBriefingCard {
  const activePathways: FormationBriefingPathway[] = [];
  const stalledSteps: FormationBriefingStep[] = [];
  const completedPathways: FormationBriefingPathway[] = [];

  for (const profile of formationProfileIndex?.getAllProfiles() ?? []) {
    if (profile.activePathway) {
      activePathways.push({ ...profile.activePathway, memberId: profile.memberId });
    }

    stalledSteps.push(
      ...profile.stalledSteps.map((step) => ({ ...step, memberId: profile.memberId }))
    );
    completedPathways.push(
      ...profile.history.map((pathway) => ({ ...pathway, memberId: profile.memberId }))
    );
  }

  return {
    activePathways,
    stalledSteps,
    completedPathways,
    nextRecommendedStep: null
  };
}

function careLane(
  key: MorningBriefingCareLaneKey,
  label: string,
  count: number,
  candidates: readonly CanonicalMorningBriefingCareCandidate[],
  matches: (candidate: CanonicalMorningBriefingCareCandidate) => boolean
): MorningBriefingCareLane {
  const targets = candidates
    .filter(matches)
    .slice(0, MORNING_BRIEFING_CARE_TARGET_LIMIT)
    .map(toCareTarget);

  return {
    key,
    label,
    count,
    targets,
    additionalTargetCount: Math.max(0, count - targets.length)
  };
}

function action(
  key: string,
  priority: MorningBriefingActionPriority,
  label: string,
  reason: string,
  source: MorningBriefingAction["source"],
  sourcePath: string,
  count: number,
  primaryTarget?: MorningBriefingCareTarget
): MorningBriefingAction {
  const result: MorningBriefingAction = {
    key,
    priority,
    label,
    reason,
    source,
    sourcePath,
    count
  };

  if (primaryTarget) {
    result.primaryTarget = primaryTarget;
  }

  return result;
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
  const careCandidates = input.careCandidates ?? [];
  const careLanes: MorningBriefingCareLane[] = [
    careLane(
      "urgent-care",
      "Urgent care",
      intelligence.careLoad.urgentCount,
      careCandidates,
      (candidate) => candidate.carePriority === "urgent"
    ),
    careLane(
      "unassigned-care",
      "Unassigned care",
      intelligence.careLoad.unassignedCount,
      careCandidates,
      (candidate) => candidate.assignmentState === "unassigned"
    ),
    careLane(
      "shared-care-queue",
      "Shared care queue",
      intelligence.careLoad.queueCount,
      careCandidates,
      (candidate) => candidate.assignmentBucket === "queue"
    )
  ];
  const careLanesByKey = new Map(
    careLanes.map((lane) => [lane.key, lane] as const)
  );

  if (intelligence.careLoad.urgentCount > 0) {
    actions.push(action(
      "urgent-care",
      "urgent",
      "Review urgent operational care signals",
      `${intelligence.careLoad.urgentCount} urgent care candidate(s) are in the Activity Intelligence care load.`,
      "activity-intelligence",
      "/api/activity-intelligence",
      intelligence.careLoad.urgentCount,
      careLanesByKey.get("urgent-care")?.targets[0]
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
      "activity-intelligence",
      "/api/activity-intelligence",
      intelligence.careLoad.unassignedCount,
      careLanesByKey.get("unassigned-care")?.targets[0]
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
    todayCareSummary: complete && input.careCandidates !== undefined
      ? {
          peopleNeedingCare: careCandidates.length,
          needsAttentionToday: careCandidates.filter((candidate) =>
            candidate.carePriority === "urgent" ||
            candidate.carePriority === "elevated" ||
            candidate.assignmentState === "unassigned"
          ).length,
          urgentCare: careCandidates.filter(
            (candidate) => candidate.carePriority === "urgent"
          ).length
        }
      : null,
    care: {
      urgentCount: intelligence.careLoad.urgentCount,
      unassignedCount: intelligence.careLoad.unassignedCount,
      lanes: careLanes
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
    formation: buildFormationBriefingCard(input.formationProfileIndex),
    ownership: {
      assignedCount: intelligence.careLoad.assignedCount,
      unassignedCount: intelligence.careLoad.unassignedCount,
      ownedCount: intelligence.careLoad.ownedCount,
      queueCount: intelligence.careLoad.queueCount
    }
  };
}