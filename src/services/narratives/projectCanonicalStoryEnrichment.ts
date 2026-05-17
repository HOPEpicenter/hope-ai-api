import type { CanonicalStoryEnrichment } from "./canonicalStoryEnrichmentContracts";

export type CanonicalStoryEnrichmentProjection = {
  attentionLevel: CanonicalStoryEnrichment["attentionLevel"];
  concernCount: number;
  highlightCount: number;
  concerns: CanonicalStoryEnrichment["concerns"];
  highlights: CanonicalStoryEnrichment["highlights"];
  metadata?: CanonicalStoryEnrichment["metadata"];
};

export function projectCanonicalStoryEnrichment(
  enrichment: CanonicalStoryEnrichment
): CanonicalStoryEnrichmentProjection {
  return {
    attentionLevel: enrichment.attentionLevel,
    concernCount: enrichment.concerns.length,
    highlightCount: enrichment.highlights.length,
    concerns: enrichment.concerns,
    highlights: enrichment.highlights,
    metadata: enrichment.metadata
  };
}