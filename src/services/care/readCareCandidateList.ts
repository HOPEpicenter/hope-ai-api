import {
  buildCareCandidateList,
  type BuildCareCandidateListInput,
  type CareCandidateListResult
} from "./buildCareCandidateList";

export type ReadCareCandidateListInput = BuildCareCandidateListInput & {
  carePriority?: string | null;
  careAgeBucket?: string | null;
  escalationLevel?: string | null;
  assignmentState?: string | null;
  assignmentBucket?: string | null;
};

export type CareQueueSummary = {
  totalCandidates: number;
  filteredCount: number;
  urgentCount: number;
  staleCount: number;
  escalationCount: number;
  byPriority: {
    normal: number;
    elevated: number;
    urgent: number;
  };
  byAgeBucket: {
    new: number;
    aging: number;
    stale: number;
  };
  byEscalationLevel: {
    none: number;
    review: number;
    escalate: number;
  };
  byAssignmentState: {
    assigned: number;
    unassigned: number;
  };
  byAssignmentBucket: {
    owned: number;
    queue: number;
  };
};

export type ReadCareCandidateListResult =
  CareCandidateListResult & {
    summary: CareQueueSummary;
  };

export function readCareCandidateList(
  input: ReadCareCandidateListInput
): ReadCareCandidateListResult {
  const projected = buildCareCandidateList({
    profiles: input.profiles
  });

  const items = projected.items.filter((item) => {
    if (
      input.carePriority &&
      item.carePriority !== input.carePriority
    ) {
      return false;
    }

    if (
      input.careAgeBucket &&
      item.careAgeBucket !== input.careAgeBucket
    ) {
      return false;
    }

    if (
      input.escalationLevel &&
      item.escalationLevel !== input.escalationLevel
    ) {
      return false;
    }

    if (
      input.assignmentState &&
      item.assignmentState !== input.assignmentState
    ) {
      return false;
    }

    if (
      input.assignmentBucket &&
      item.assignmentBucket !== input.assignmentBucket
    ) {
      return false;
    }

    return true;
  });

  return {
    ok: true,
    count: items.length,
    items,
    summary: {
      totalCandidates: projected.items.length,
      filteredCount: items.length,
      urgentCount: projected.items.filter(
        (x) => x.carePriority === "urgent"
      ).length,
      staleCount: projected.items.filter(
        (x) => x.careAgeBucket === "stale"
      ).length,
      escalationCount: projected.items.filter(
        (x) => x.escalationLevel === "escalate"
      ).length,
      byPriority: {
        normal: projected.items.filter((x) => x.carePriority === "normal").length,
        elevated: projected.items.filter((x) => x.carePriority === "elevated").length,
        urgent: projected.items.filter((x) => x.carePriority === "urgent").length
      },
      byAgeBucket: {
        new: projected.items.filter((x) => x.careAgeBucket === "new").length,
        aging: projected.items.filter((x) => x.careAgeBucket === "aging").length,
        stale: projected.items.filter((x) => x.careAgeBucket === "stale").length
      },
      byEscalationLevel: {
        none: projected.items.filter((x) => x.escalationLevel === "none").length,
        review: projected.items.filter((x) => x.escalationLevel === "review").length,
        escalate: projected.items.filter((x) => x.escalationLevel === "escalate").length
      },
      byAssignmentState: {
        assigned: projected.items.filter((x) => x.assignmentState === "assigned").length,
        unassigned: projected.items.filter((x) => x.assignmentState === "unassigned").length
      },
      byAssignmentBucket: {
        owned: projected.items.filter((x) => x.assignmentBucket === "owned").length,
        queue: projected.items.filter((x) => x.assignmentBucket === "queue").length
      }
    }
  };
}
