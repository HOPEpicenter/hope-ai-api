import type { OpsFollowupsQueueResult } from "../followups/opsFollowupsQueueContracts";
import type { CanonicalVisitorNarrative } from "./canonicalNarrativeContracts";

export type CanonicalVisitorOperationalNarrative = {
  visitor: CanonicalVisitorNarrative;
  operations: {
    followups: OpsFollowupsQueueResult | null;
  };
};

export type BuildCanonicalVisitorOperationalNarrativeInput = {
  visitor: CanonicalVisitorNarrative;
  followups?: OpsFollowupsQueueResult | null;
};

export function buildCanonicalVisitorOperationalNarrative(
  input: BuildCanonicalVisitorOperationalNarrativeInput
): CanonicalVisitorOperationalNarrative {
  return {
    visitor: input.visitor,
    operations: {
      followups: input.followups ?? null
    }
  };
}
export type CanonicalUnifiedVisitorStory = {
  storyType: "visitor";
  visitor: CanonicalVisitorNarrative;
  operations: {
    followups: OpsFollowupsQueueResult | null;
  };
};

export function buildCanonicalUnifiedVisitorStory(
  input: BuildCanonicalVisitorOperationalNarrativeInput
): CanonicalUnifiedVisitorStory {
  const narrative = buildCanonicalVisitorOperationalNarrative(input);

  return {
    storyType: "visitor",
    visitor: narrative.visitor,
    operations: narrative.operations
  };
}