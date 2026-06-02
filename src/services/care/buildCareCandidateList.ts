import {
  deriveCareCandidate,
  type DeriveCareCandidateInput
} from "./deriveCareCandidate";
import type { CareCandidate } from "./careCandidateContracts";

export type BuildCareCandidateListInput = {
  profiles: DeriveCareCandidateInput[];
};

export type CareCandidateListResult = {
  ok: true;
  count: number;
  items: CareCandidate[];
};

export function buildCareCandidateList(
  input: BuildCareCandidateListInput
): CareCandidateListResult {
  const items = input.profiles
    .map((profile) => deriveCareCandidate(profile))
    .filter((item): item is CareCandidate => item !== null)
    .sort(compareCareCandidates);

  return {
    ok: true,
    count: items.length,
    items
  };
}

function compareCareCandidates(a: CareCandidate, b: CareCandidate): number {
  const openedDiff = b.openedAt.localeCompare(a.openedAt);
  if (openedDiff !== 0) return openedDiff;

  return a.visitorId.localeCompare(b.visitorId);
}
