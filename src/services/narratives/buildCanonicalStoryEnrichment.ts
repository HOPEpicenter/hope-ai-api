import type { CanonicalStoryEnrichment } from "./canonicalStoryEnrichmentContracts";

export type BuildCanonicalStoryEnrichmentInput = {
  metadata?: Record<string, unknown>;
};

export function buildCanonicalStoryEnrichment(
  input: BuildCanonicalStoryEnrichmentInput = {}
): CanonicalStoryEnrichment {
  return {
    attentionLevel: "none",
    concerns: [],
    highlights: [],
    metadata: input.metadata
  };
}