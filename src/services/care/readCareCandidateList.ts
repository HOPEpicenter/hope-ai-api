import {
  buildCareCandidateList,
  type BuildCareCandidateListInput,
  type CareCandidateListResult
} from "./buildCareCandidateList";

export type ReadCareCandidateListInput = BuildCareCandidateListInput & {
  carePriority?: string | null;
  careAgeBucket?: string | null;
  escalationLevel?: string | null;
};

export type CareQueueSummary = {
  totalCandidates: number;
  filteredCount: number;
  urgentCount: number;
  staleCount: number;
  escalationCount: number;
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
      ).length
    }
  };
}
