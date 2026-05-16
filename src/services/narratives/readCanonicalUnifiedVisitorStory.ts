import { buildCanonicalUnifiedVisitorStory } from "./canonicalOperationalNarrativeContracts";
import type { CanonicalVisitorNarrative } from "./canonicalNarrativeContracts";
import type { OpsFollowupsQueueResult } from "../followups/opsFollowupsQueueContracts";
import type { CanonicalUnifiedVisitorStory } from "./canonicalOperationalNarrativeContracts";

export type ReadCanonicalUnifiedVisitorStoryInput = {
  visitor: CanonicalVisitorNarrative;
  followups?: OpsFollowupsQueueResult | null;
};

export async function readCanonicalUnifiedVisitorStory(
  input: ReadCanonicalUnifiedVisitorStoryInput
): Promise<CanonicalUnifiedVisitorStory> {
  return buildCanonicalUnifiedVisitorStory({
    visitor: input.visitor,
    followups: input.followups ?? null
  });
}