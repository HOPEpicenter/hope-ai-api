import type { CanonicalStoryView } from "./buildCanonicalStoryView";

export type CanonicalStoryConsumerSnapshot = {
  storyType: CanonicalStoryView["story"]["storyType"];
  attentionLevel: CanonicalStoryView["projection"]["attentionLevel"];
  concernCount: number;
  highlightCount: number;
  hasConcerns: boolean;
  hasHighlights: boolean;
  metadata?: CanonicalStoryView["projection"]["metadata"];
};

export function consumeCanonicalStoryView(
  view: CanonicalStoryView
): CanonicalStoryConsumerSnapshot {
  return {
    storyType: view.story.storyType,
    attentionLevel: view.projection.attentionLevel,
    concernCount: view.projection.concernCount,
    highlightCount: view.projection.highlightCount,
    hasConcerns: view.projection.concernCount > 0,
    hasHighlights: view.projection.highlightCount > 0,
    metadata: view.projection.metadata
  };
}