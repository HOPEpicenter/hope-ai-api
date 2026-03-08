export type FollowupItem = {
  visitorId: string;
  name: string;
  status: "OPEN" | "RESOLVED";
  assignedTo?: string | null;
  followupReason?: string | null;
  updatedAt: string;
};

export type FollowupsResponse = {
  ok: boolean;
  items: FollowupItem[];
};
