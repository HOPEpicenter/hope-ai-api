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

export type ReadCareCandidateListResult = CareCandidateListResult;

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
    items
  };
}

