export type DerivedFollowupStatus = "none" | "action_needed" | "contact_made" | "resolved";

export type DerivedFollowupState = {
  followupStatus: DerivedFollowupStatus;
  needsAttention: boolean;
  isContactMade: boolean;
};

export function deriveFollowupState(profile: any): DerivedFollowupState {
  const assigned = !!profile?.assignedTo;
  const contacted = !!profile?.lastFollowupContactedAt;
  const outcome = !!profile?.lastFollowupOutcomeAt;

  if (!assigned) {
    return {
      followupStatus: "none",
      needsAttention: false,
      isContactMade: false
    };
  }

  if (outcome) {
    return {
      followupStatus: "resolved",
      needsAttention: false,
      isContactMade: false
    };
  }

  if (contacted) {
    return {
      followupStatus: "contact_made",
      needsAttention: false,
      isContactMade: true
    };
  }

  return {
    followupStatus: "action_needed",
    needsAttention: true,
    isContactMade: false
  };
}
