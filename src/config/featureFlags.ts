/** Default-off feature-flag scaffold. */
export type FeatureFlags = {
  phase4Aggregation: boolean;
  staffInvitations: boolean;
};

export function getFeatureFlags(): FeatureFlags {
  return {
    phase4Aggregation:
      String(process.env.FEATURE_PHASE4_AGGREGATION ?? "").trim().toLowerCase() === "true",
    staffInvitations:
      String(process.env.FEATURE_STAFF_INVITATIONS ?? "").trim().toLowerCase() === "true",
  };
}
