import { buildCanonicalStoryEnrichment } from "./buildCanonicalStoryEnrichment";
import type { CanonicalStoryEnrichment } from "./canonicalStoryEnrichmentContracts";
import type { CanonicalUnifiedVisitorStory } from "./canonicalOperationalNarrativeContracts";

export type ComposeCanonicalStoryEnrichmentInput = {
  story: CanonicalUnifiedVisitorStory;
  metadata?: Record<string, unknown>;
};

export function composeCanonicalStoryEnrichment(
  input: ComposeCanonicalStoryEnrichmentInput
): CanonicalStoryEnrichment {
  return buildCanonicalStoryEnrichment({
    metadata: {
      storyType: input.story.storyType,
      ...input.metadata
    }
  });
}