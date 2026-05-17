export type CanonicalStoryOrchestrationCapability =
  | "canonical_story_gateway"
  | string;

export type CanonicalStoryOrchestrationRegistryEntry = {
  capability: CanonicalStoryOrchestrationCapability;
  description: string;
  deterministic: boolean;
};

export type CanonicalStoryOrchestrationRegistry = {
  capabilities: CanonicalStoryOrchestrationRegistryEntry[];
};

export function readCanonicalStoryOrchestrationRegistry(): CanonicalStoryOrchestrationRegistry {
  return {
    capabilities: [
      {
        capability: "canonical_story_gateway",
        description: "Deterministic canonical story gateway composition is available.",
        deterministic: true
      }
    ]
  };
}