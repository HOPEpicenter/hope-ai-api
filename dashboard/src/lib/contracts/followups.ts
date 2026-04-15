export type FollowupItem = {
  visitorId: string;
  assignedTo: { ownerType: "user"; ownerId: string } | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupContactedAt: string | null;
  lastFollowupOutcomeAt: string | null;
  lastFollowupOutcome: string | null;
  resolvedForAssignment: boolean;
  stage: string | null;
  needsFollowup: boolean;
  followupState: "action-needed" | "contact-made" | "done" | "unassigned";
  ageBucket: "<24h" | "24-48h" | "48-72h" | "72h+";
  urgency: "ON_TRACK" | "WATCH" | "AT_RISK" | "OVERDUE";
};

export type FollowupsResponse = {
  ok: boolean;
  items: FollowupItem[];
};
