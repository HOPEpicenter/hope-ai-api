import {
  buildCareCandidateList,
  type BuildCareCandidateListInput,
  type CareCandidateListResult
} from "./buildCareCandidateList";
import {
  applyCanonicalCareProjection
} from "./applyCanonicalCareProjection";
import type {
  CanonicalVisitorDashboardCard
} from "../dashboard/canonicalDashboardContracts";

export type ReadCareCandidateListInput = BuildCareCandidateListInput & {
  carePriority?: string | null;
  careAgeBucket?: string | null;
  escalationLevel?: string | null;
  assignmentState?: string | null;
  assignmentBucket?: string | null;
  canonicalCardsByVisitorId?: ReadonlyMap<
    string,
    CanonicalVisitorDashboardCard
  >;
};

export type CareQueueSummary = {
  totalCandidates: number;
  filteredCount: number;
  urgentCount: number;
  staleCount: number;
  escalationCount: number;
  assignedCount: number;
  unassignedCount: number;
  ownedCount: number;
  queueCount: number;
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

  const allItems = projected.items.map((item) => {
    const card =
      input.canonicalCardsByVisitorId?.get(item.visitorId);

    return card
      ? applyCanonicalCareProjection(item, card)
      : item;
  });

  const items = allItems.filter((item) => {
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
      totalCandidates: allItems.length,
      filteredCount: items.length,
      urgentCount: allItems.filter(
        (x) => x.carePriority === "urgent"
      ).length,
      staleCount: allItems.filter(
        (x) => x.careAgeBucket === "stale"
      ).length,
      escalationCount: allItems.filter(
        (x) => x.escalationLevel === "escalate"
      ).length,
      assignedCount: allItems.filter(
        (x) => x.assignmentState === "assigned"
      ).length,
      unassignedCount: allItems.filter(
        (x) => x.assignmentState === "unassigned"
      ).length,
      ownedCount: allItems.filter(
        (x) => x.assignmentBucket === "owned"
      ).length,
      queueCount: allItems.filter(
        (x) => x.assignmentBucket === "queue"
      ).length,
      byPriority: {
        normal: allItems.filter((x) => x.carePriority === "normal").length,
        elevated: allItems.filter((x) => x.carePriority === "elevated").length,
        urgent: allItems.filter((x) => x.carePriority === "urgent").length
      },
      byAgeBucket: {
        new: allItems.filter((x) => x.careAgeBucket === "new").length,
        aging: allItems.filter((x) => x.careAgeBucket === "aging").length,
        stale: allItems.filter((x) => x.careAgeBucket === "stale").length
      },
      byEscalationLevel: {
        none: allItems.filter((x) => x.escalationLevel === "none").length,
        review: allItems.filter((x) => x.escalationLevel === "review").length,
        escalate: allItems.filter((x) => x.escalationLevel === "escalate").length
      },
      byAssignmentState: {
        assigned: allItems.filter((x) => x.assignmentState === "assigned").length,
        unassigned: allItems.filter((x) => x.assignmentState === "unassigned").length
      },
      byAssignmentBucket: {
        owned: allItems.filter((x) => x.assignmentBucket === "owned").length,
        queue: allItems.filter((x) => x.assignmentBucket === "queue").length
      }
    }
  };
}
