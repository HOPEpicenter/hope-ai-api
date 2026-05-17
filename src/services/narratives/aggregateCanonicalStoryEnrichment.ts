import { composeCanonicalStoryEnrichment } from "./composeCanonicalStoryEnrichment";
import {
  synthesizeCanonicalStoryConcerns,
  synthesizeCanonicalStoryHighlights
} from "./synthesizeCanonicalStoryEnrichment";
import type { CanonicalStoryEnrichment } from "./canonicalStoryEnrichmentContracts";
import type { CanonicalUnifiedVisitorStory } from "./canonicalOperationalNarrativeContracts";

export type AggregateCanonicalStoryEnrichmentInput = {
  story: CanonicalUnifiedVisitorStory;
  metadata?: Record<string, unknown>;
};

export function aggregateCanonicalStoryEnrichment(
  input: AggregateCanonicalStoryEnrichmentInput
): CanonicalStoryEnrichment {
  const base = composeCanonicalStoryEnrichment({
    story: input.story,
    metadata: input.metadata
  });

  return {
    ...base,
    concerns: synthesizeCanonicalStoryConcerns({ story: input.story }),
    highlights: synthesizeCanonicalStoryHighlights({ story: input.story })
  };
}