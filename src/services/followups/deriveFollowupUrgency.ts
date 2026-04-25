export type FollowupUrgency = "OVERDUE" | "AT_RISK" | "ON_TRACK";

export function getFollowupAgeHours(value: string | null | undefined): number | null {
  if (!value) return null;

  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;

  const diffMs = Date.now() - ms;
  if (diffMs < 0) return 0;

  return Math.floor(diffMs / (1000 * 60 * 60));
}

export function deriveFollowupUrgency(args: {
  assignedTo: string | null | undefined;
  followupStatus: string | null | undefined;
  lastFollowupAssignedAt: string | null | undefined;
}): FollowupUrgency | null {
  if (!args.assignedTo || args.followupStatus === "resolved") {
    return null;
  }

  const ageHours = getFollowupAgeHours(args.lastFollowupAssignedAt);

  if (ageHours !== null && ageHours >= 48) return "OVERDUE";
  if (ageHours !== null && ageHours >= 24) return "AT_RISK";
  return "ON_TRACK";
}
