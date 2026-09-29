import type {
  CareCandidate
} from "../care/careCandidateContracts";
import type {
  SixWeekFollowupQueueItem
} from "../followups/readSixWeekVisitorFollowups";

export type MinistryAreaReadinessActionPriority =
  | "urgent"
  | "high"
  | "medium";

export type MinistryAreaReadinessActionKey =
  | "urgent-care"
  | "overdue-followups"
  | "escalated-care"
  | "elevated-care"
  | "stale-care"
  | "due-followups";

export type MinistryAreaReadinessAction = {
  key: MinistryAreaReadinessActionKey;
  priority: MinistryAreaReadinessActionPriority;
  label: string;
  reason: string;
  source: "care" | "six-week-followup";
  sourcePath: string;
  count: number;
};

export type MinistryAreaReadinessRecommendationRecords = {
  careCandidates: CareCandidate[];
  sixWeekFollowups: SixWeekFollowupQueueItem[];
};

export type MinistryAreaReadinessRecommendation = {
  care: {
    totalOwned: number;
    urgent: number;
    elevated: number;
    stale: number;
    escalated: number;
  };
  sixWeekFollowup: {
    totalOwned: number;
    due: number;
    overdue: number;
  };
  recommendedFirstAction: MinistryAreaReadinessAction | null;
  recommendedRecords: MinistryAreaReadinessRecommendationRecords;
};

type CareActionRule = {
  key: MinistryAreaReadinessActionKey;
  priority: MinistryAreaReadinessActionPriority;
  label: string;
  source: "care";
  matches: (candidate: CareCandidate) => boolean;
  reason: (count: number) => string;
};

type FollowupActionRule = {
  key: MinistryAreaReadinessActionKey;
  priority: MinistryAreaReadinessActionPriority;
  label: string;
  source: "six-week-followup";
  matches: (item: SixWeekFollowupQueueItem) => boolean;
  reason: (count: number) => string;
};

type RecommendationRule = CareActionRule | FollowupActionRule;

type RecommendationSourceRecords = {
  careCandidates: readonly CareCandidate[];
  sixWeekFollowups: readonly SixWeekFollowupQueueItem[];
};

const RECOMMENDATION_RULES: readonly RecommendationRule[] = [
  {
    key: "urgent-care",
    priority: "urgent",
    label: "Review urgent care",
    source: "care",
    matches: candidate => candidate.carePriority === "urgent",
    reason: count =>
      `${count} urgent care candidate(s) are owned by Staff linked to this Ministry Area.`
  },
  {
    key: "overdue-followups",
    priority: "urgent",
    label: "Review overdue follow-ups",
    source: "six-week-followup",
    matches: item => item.plan.nextTask?.status === "overdue",
    reason: count =>
      `${count} six-week follow-up(s) owned by Staff linked to this Ministry Area are overdue.`
  },
  {
    key: "escalated-care",
    priority: "high",
    label: "Review escalated care",
    source: "care",
    matches: candidate => candidate.escalationLevel === "escalate",
    reason: count =>
      `${count} care candidate(s) owned by Staff linked to this Ministry Area require escalation.`
  },
  {
    key: "elevated-care",
    priority: "high",
    label: "Review elevated care",
    source: "care",
    matches: candidate => candidate.carePriority === "elevated",
    reason: count =>
      `${count} elevated care candidate(s) are owned by Staff linked to this Ministry Area.`
  },
  {
    key: "stale-care",
    priority: "medium",
    label: "Review stale care",
    source: "care",
    matches: candidate => candidate.careAgeBucket === "stale",
    reason: count =>
      `${count} stale care candidate(s) are owned by Staff linked to this Ministry Area.`
  },
  {
    key: "due-followups",
    priority: "medium",
    label: "Review due follow-ups",
    source: "six-week-followup",
    matches: item => item.plan.nextTask?.status === "due",
    reason: count =>
      `${count} six-week follow-up(s) owned by Staff linked to this Ministry Area are due.`
  }
];

function selectRuleRecords(
  rule: RecommendationRule,
  sourceRecords: RecommendationSourceRecords
): MinistryAreaReadinessRecommendationRecords {
  if (rule.source === "care") {
    return {
      careCandidates:
        sourceRecords.careCandidates.filter(rule.matches),
      sixWeekFollowups: []
    };
  }

  return {
    careCandidates: [],
    sixWeekFollowups:
      sourceRecords.sixWeekFollowups.filter(rule.matches)
  };
}

function selectedRecordCount(
  rule: RecommendationRule,
  records: MinistryAreaReadinessRecommendationRecords
): number {
  return rule.source === "care"
    ? records.careCandidates.length
    : records.sixWeekFollowups.length;
}

export function buildMinistryAreaReadinessRecommendation(
  ministryAreaId: string,
  sourceRecords: RecommendationSourceRecords
): MinistryAreaReadinessRecommendation {
  const evaluations = RECOMMENDATION_RULES.map(rule => {
    const records = selectRuleRecords(rule, sourceRecords);
    return {
      rule,
      records,
      count: selectedRecordCount(rule, records)
    };
  });
  const countFor = (key: MinistryAreaReadinessActionKey) =>
    evaluations.find(evaluation => evaluation.rule.key === key)?.count ?? 0;
  const care = {
    totalOwned: sourceRecords.careCandidates.length,
    urgent: countFor("urgent-care"),
    elevated: countFor("elevated-care"),
    stale: countFor("stale-care"),
    escalated: countFor("escalated-care")
  };
  const sixWeekFollowup = {
    totalOwned: sourceRecords.sixWeekFollowups.length,
    due: countFor("due-followups"),
    overdue: countFor("overdue-followups")
  };
  const selected = evaluations.find(evaluation => evaluation.count > 0);
  const recommendedFirstAction = selected
    ? {
        key: selected.rule.key,
        priority: selected.rule.priority,
        label: selected.rule.label,
        reason: selected.rule.reason(selected.count),
        source: selected.rule.source,
        sourcePath:
          `/api/ministry-areas/${encodeURIComponent(ministryAreaId)}/readiness`,
        count: selected.count
      }
    : null;

  return {
    care,
    sixWeekFollowup,
    recommendedFirstAction,
    recommendedRecords: selected?.records ?? {
      careCandidates: [],
      sixWeekFollowups: []
    }
  };
}