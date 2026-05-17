import type { CanonicalStoryConsumerSnapshot } from "./consumeCanonicalStoryView";

export type CanonicalStoryAdapterPayload = {
  storyType: CanonicalStoryConsumerSnapshot["storyType"];
  attentionLevel: CanonicalStoryConsumerSnapshot["attentionLevel"];
  indicators: {
    concernCount: number;
    highlightCount: number;
    hasConcerns: boolean;
    hasHighlights: boolean;
  };
  metadata?: CanonicalStoryConsumerSnapshot["metadata"];
};

export function adaptCanonicalStoryConsumerSnapshot(
  snapshot: CanonicalStoryConsumerSnapshot
): CanonicalStoryAdapterPayload {
  return {
    storyType: snapshot.storyType,
    attentionLevel: snapshot.attentionLevel,
    indicators: {
      concernCount: snapshot.concernCount,
      highlightCount: snapshot.highlightCount,
      hasConcerns: snapshot.hasConcerns,
      hasHighlights: snapshot.hasHighlights
    },
    metadata: snapshot.metadata
  };
}