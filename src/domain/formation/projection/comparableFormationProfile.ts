export type ComparableFormationProfile = {
  stage?: string | null;
  stageUpdatedAt?: string | null;
  stageUpdatedBy?: string | null;
  stageReason?: string | null;
  stageEventId?: string | null;
  assignedTo?: string | null;
  lastEventType?: string | null;
  lastEventAt?: string | null;
  lastEventId?: string | null;
  lastActorId?: string | null;
  lastSourceSystem?: string | null;
  lastSourceCategory?: string | null;
  lastServiceAttendedAt?: string | null;
  lastFollowupAssignedAt?: string | null;
  lastFollowupContactedAt?: string | null;
  lastFollowupOutcomeAt?: string | null;
  lastFollowupOutcome?: string | null;
  lastFollowupOutcomeNotes?: string | null;
  lastNextStepAt?: string | null;
  lastPrayerRequestedAt?: string | null;
  displayName?: string | null;
  groups?: any[] | null;
};

export function toComparableFormationProfileState(
  profile: ComparableFormationProfile | null
): string {
  if (!profile) {
    return "";
  }

  return JSON.stringify({
    stage: profile.stage ?? null,
    stageUpdatedAt: profile.stageUpdatedAt ?? null,
    stageUpdatedBy: profile.stageUpdatedBy ?? null,
    stageReason: profile.stageReason ?? null,
    stageEventId: profile.stageEventId ?? null,
    assignedTo: profile.assignedTo ?? null,
    lastEventType: profile.lastEventType ?? null,
    lastEventAt: profile.lastEventAt ?? null,
    lastEventId: profile.lastEventId ?? null,
    lastActorId: profile.lastActorId ?? null,
    lastSourceSystem: profile.lastSourceSystem ?? null,
    lastSourceCategory: profile.lastSourceCategory ?? null,
    lastServiceAttendedAt: profile.lastServiceAttendedAt ?? null,
    lastFollowupAssignedAt: profile.lastFollowupAssignedAt ?? null,
    lastFollowupContactedAt: profile.lastFollowupContactedAt ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeNotes: profile.lastFollowupOutcomeNotes ?? null,
    lastNextStepAt: profile.lastNextStepAt ?? null,
    lastPrayerRequestedAt: profile.lastPrayerRequestedAt ?? null,
    displayName: profile.displayName ?? null,
    groups: Array.isArray(profile.groups) ? profile.groups : null
  });
}

