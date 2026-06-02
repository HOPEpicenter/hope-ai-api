import {
  buildCareCandidateList,
  type BuildCareCandidateListInput
} from "./buildCareCandidateList";
import type { CareCandidate } from "./careCandidateContracts";

export type ReadCareCandidateByVisitorIdInput =
  BuildCareCandidateListInput & {
    visitorId: string;
  };

export type ReadCareCandidateByVisitorIdResult = {
  ok: true;
  found: boolean;
  item: CareCandidate | null;
};

export function readCareCandidateByVisitorId(
  input: ReadCareCandidateByVisitorIdInput
): ReadCareCandidateByVisitorIdResult {
  const projected = buildCareCandidateList({
    profiles: input.profiles
  });

  const visitorId = input.visitorId.trim();

  const item =
    projected.items.find(
      (candidate) => candidate.visitorId === visitorId
    ) ?? null;

  return {
    ok: true,
    found: item !== null,
    item
  };
}
