export type CanonicalStoryFacet =
  | "engagement"
  | "formation"
  | "journey"
  | "followup"
  | "operations"
  | "attention"
  | string;

export type CanonicalStoryAttentionLevel =
  | "none"
  | "watch"
  | "needs_attention"
  | "urgent"
  | string;

export type CanonicalStoryConcern = {
  facet: CanonicalStoryFacet;
  level: CanonicalStoryAttentionLevel;
  reason?: string;
  evidence?: unknown[];
};

export type CanonicalStoryHighlight = {
  facet: CanonicalStoryFacet;
  summary: string;
  evidence?: unknown[];
};

export type CanonicalStoryEnrichment = {
  attentionLevel?: CanonicalStoryAttentionLevel;
  concerns: CanonicalStoryConcern[];
  highlights: CanonicalStoryHighlight[];
  metadata?: Record<string, unknown>;
};