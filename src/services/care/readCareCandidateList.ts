import {
  buildCareCandidateList,
  type BuildCareCandidateListInput,
  type CareCandidateListResult
} from "./buildCareCandidateList";

export type ReadCareCandidateListInput = BuildCareCandidateListInput;

export type ReadCareCandidateListResult = CareCandidateListResult;

export function readCareCandidateList(
  input: ReadCareCandidateListInput
): ReadCareCandidateListResult {
  return buildCareCandidateList(input);
}
