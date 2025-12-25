export type Urgency = "OVERDUE" | "DUE_SOON" | "WATCH";

export type FollowupComputed = {
  stage: string;
  urgency: Urgency | null;
  assignedTo: string | null;
  lastActivityAt: Date | null;
  daysSinceLastActivity: number | null;
  lastFollowupAssignedAt: Date | null;
  lastFollowupOutcomeAt: Date | null;
  recommendedAction: string | null;
  reason: string | null;
};

/**
 * Minimal queue computation from a Formation Profile entity.
 * This intentionally does NOT enforce strict schema — it safely reads known fields.
 */
export function computeFromProfile(profile: any, now: Date = new Date()): FollowupComputed {
  const stage = String(profile?.stage ?? "Unknown");

  const assignedTo =
    typeof profile?.assignedTo === "string" && profile.assignedTo.trim()
      ? profile.assignedTo.trim()
      : null;

  const stageUpdatedAt = parseDate(profile?.stageUpdatedAt);
  const lastFollowupAssignedAt = parseDate(profile?.lastFollowupAssignedAt);
  const lastFollowupOutcomeAt = parseDate(profile?.lastFollowupOutcomeAt);

  // "lastActivityAt" = most recent meaningful timestamp we have
  const lastActivityAt = maxDate(stageUpdatedAt, lastFollowupAssignedAt, lastFollowupOutcomeAt);

  const daysSinceLastActivity =
    lastActivityAt ? Math.floor((now.getTime() - lastActivityAt.getTime()) / (24 * 60 * 60 * 1000)) : null;

  // Urgency logic:
  // - If assigned and no outcome: DUE_SOON immediately, OVERDUE after 48h
  // - If outcome exists: WATCH
  // - If nothing meaningful: null (won't appear in queue if caller filters on urgency)
  let urgency: Urgency | null = null;
  let recommendedAction: string | null = null;
  let reason: string | null = null;

  const hasAssigned = !!lastFollowupAssignedAt;
  const hasOutcome = !!lastFollowupOutcomeAt;

  if (hasAssigned && !hasOutcome) {
    const hoursSinceAssigned = Math.floor((now.getTime() - lastFollowupAssignedAt!.getTime()) / (60 * 60 * 1000));
    urgency = hoursSinceAssigned >= 48 ? "OVERDUE" : "DUE_SOON";
    recommendedAction = urgency === "OVERDUE" ? "Immediate follow-up" : "Contact within 48h";
    reason = "Follow-up assigned + no outcome recorded";
  } else if (hasOutcome) {
    urgency = "WATCH";
    recommendedAction = "Light touch / confirm next step";
    reason = "Outcome recorded";
  } else if (assignedTo) {
    // assignedTo set but no timestamps (should be rare)
    urgency = "DUE_SOON";
    recommendedAction = "Contact within 48h";
    reason = "Assigned (missing timestamps)";
  } else {
    urgency = null;
    recommendedAction = null;
    reason = null;
  }

  return {
    stage,
    urgency,
    assignedTo,
    lastActivityAt,
    daysSinceLastActivity,
    lastFollowupAssignedAt,
    lastFollowupOutcomeAt,
    recommendedAction,
    reason
  };
}

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === "string") {
    const ms = Date.parse(val);
    if (!Number.isNaN(ms)) return new Date(ms);
  }
  return null;
}

function maxDate(...dates: Array<Date | null>): Date | null {
  const valid = dates.filter((d): d is Date => !!d && !Number.isNaN(d.getTime()));
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.getTime() - a.getTime());
  return valid[0];
}
