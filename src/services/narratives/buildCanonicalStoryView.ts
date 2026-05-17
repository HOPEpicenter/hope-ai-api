import { aggregateCanonicalStoryEnrichment } from "./aggregateCanonicalStoryEnrichment";
import { projectCanonicalStoryEnrichment } from "./projectCanonicalStoryEnrichment";
import type { CanonicalStoryEnrichment } from "./canonicalStoryEnrichmentContracts";
import type { CanonicalUnifiedVisitorStory } from "./canonicalOperationalNarrativeContracts";
import type { CanonicalStoryEnrichmentProjection } from "./projectCanonicalStoryEnrichment";

export type CanonicalStoryView = {
  story: CanonicalUnifiedVisitorStory;
  enrichment: CanonicalStoryEnrichment;
  projection: CanonicalStoryEnrichmentProjection;
};

export type BuildCanonicalStoryViewInput = {
  story: CanonicalUnifiedVisitorStory;
  metadata?: Record<string, unknown>;
};

export function buildCanonicalStoryView(input: BuildCanonicalStoryViewInput): CanonicalStoryView {
  const enrichment = aggregateCanonicalStoryEnrichment({
    story: input.story,
    metadata: input.metadata
  });

  return {
    story: input.story,
    enrichment,
    projection: projectCanonicalStoryEnrichment(enrichment)
  };
}