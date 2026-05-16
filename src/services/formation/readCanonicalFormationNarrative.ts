import { projectFollowupState } from "../../functions/_shared/followupProjection";

export function buildCanonicalFormationNarrative(formationProfile: any | null) {
  const followupProjection =
    formationProfile
      ? projectFollowupState(formationProfile)
      : null;

  const profile = formationProfile
    ? {
        ...formationProfile,
        followupStatus: followupProjection?.followupState ?? null,
        attentionState: followupProjection?.attentionState ?? null,
        projectionMetadata: followupProjection?.projectionMetadata ?? null
      }
    : null;

  return {
    profile,
    milestones: {
      hasSalvation: formationProfile?.lastEventType === "SALVATION_RECORDED",
      hasBaptism: formationProfile?.lastEventType === "BAPTISM_RECORDED",
      hasMembership: formationProfile?.lastEventType === "MEMBERSHIP_RECORDED"
    }
  };
}
