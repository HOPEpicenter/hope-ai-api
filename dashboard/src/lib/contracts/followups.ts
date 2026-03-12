export type FollowupItem = {
  visitorId: string;
  assignedTo: {
    ownerType: "user";
    ownerId: string;
  } | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupContactedAt: string | null;
  lastFollowupOutcomeAt: string | null;
  lastFollowupOutcome: string | null;
  resolvedForAssignment: boolean;
  stage: string | null;
  needsFollowup: boolean;
};

export type FollowupsResponse = {
  ok: boolean;
  items: FollowupItem[];
};

