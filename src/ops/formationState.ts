export interface FormationProfile {
  stage: string | null;
  lastFormationEventType: string | null;
  lastFormationEventAt: string | null;
}

export interface FollowupSignals {
  followupReason?: string;
  followupUrgency?: "ON_TRACK" | "AT_RISK" | "OVERDUE";
  followupEscalated: boolean;
  followupOverdue: boolean;
  followupPriorityScore?: number;
  followupAgingBucket?: string;
  followupResolved: boolean;
  resolvedForAssignment: boolean;
  needsFollowup: boolean;
}

export interface FormationStateResult {
  stage: string | null;
  lastFormationEventType: string | null;
  lastFormationEventAt: string | null;
  effectiveFollowupUrgency?: "ON_TRACK" | "AT_RISK" | "OVERDUE";
  effectiveFollowupEscalated: boolean;
  priorityReason?: string | null;
}

export function deriveFormationState(params: {
  profile: FormationProfile | undefined;
  signals: FollowupSignals;
  priorityBand?: string | null;
  priorityReason?: string | null;
}): FormationStateResult {
  const { profile, signals } = params;

  let effectiveFollowupUrgency = signals.followupUrgency;
  let effectiveFollowupEscalated = signals.followupEscalated;
  let priorityReason = params.priorityReason;

  const stage = profile?.stage ?? null;

  // --- Guest overrides (EXACTLY what route does today) ---

  if (params.priorityBand === "normal" && stage === "Guest") {
    if (signals.followupReason === "FOLLOWUP_CONTACTED") {
      priorityReason = "guest_contacted_needs_followup";
    } else if (priorityReason === "needs_followup") {
      priorityReason = "guest_needs_followup";
    }
  }

  if (
    stage === "Guest" &&
    signals.followupReason === "FOLLOWUP_CONTACTED" &&
    signals.followupUrgency === "ON_TRACK"
  ) {
    effectiveFollowupUrgency = "AT_RISK";
  }

  if (
    stage === "Guest" &&
    signals.followupReason === "FOLLOWUP_CONTACTED" &&
    signals.followupAgingBucket === "ONE_DAY"
  ) {
    effectiveFollowupEscalated = true;
  }

  return {
    stage,
    lastFormationEventType: profile?.lastFormationEventType ?? null,
    lastFormationEventAt: profile?.lastFormationEventAt ?? null,
    effectiveFollowupUrgency,
    effectiveFollowupEscalated,
    priorityReason,
  };
}
