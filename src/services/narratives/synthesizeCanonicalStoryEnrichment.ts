import type {
  CanonicalStoryConcern,
  CanonicalStoryHighlight
} from "./canonicalStoryEnrichmentContracts";
import type { CanonicalUnifiedVisitorStory } from "./canonicalOperationalNarrativeContracts";

export type SynthesizeCanonicalStoryInput = {
  story: CanonicalUnifiedVisitorStory;
};

export function synthesizeCanonicalStoryHighlights(
  input: SynthesizeCanonicalStoryInput
): CanonicalStoryHighlight[] {
  return [
    {
      facet: "operations",
      summary: `Unified ${input.story.storyType} story is available for canonical orchestration.`,
      evidence: []
    }
  ];
}

export function synthesizeCanonicalStoryConcerns(
  _input: SynthesizeCanonicalStoryInput
): CanonicalStoryConcern[] {
  return [];
}