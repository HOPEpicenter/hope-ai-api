/** Default-off Phase 4 feature-flag scaffold. */
export type FeatureFlags = {
  phase4Aggregation: boolean;
};

export function getFeatureFlags(): FeatureFlags {
  return {
    phase4Aggregation:
      String(process.env.FEATURE_PHASE4_AGGREGATION ?? "").trim().toLowerCase() === "true",
  };
}
