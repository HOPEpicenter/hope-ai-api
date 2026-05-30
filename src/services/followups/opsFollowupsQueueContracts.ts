export type FollowupUrgency = "ON_TRACK" | "AT_RISK" | "OVERDUE";
export type FollowupAgingBucket = "SAME_DAY" | "ONE_DAY" | "TWO_PLUS_DAYS";

export type OpsFollowupReason =
  | "FOLLOWUP_ASSIGNED"
  | "FOLLOWUP_UNASSIGNED"
  | "FOLLOWUP_CONTACTED"
  | "FOLLOWUP_OUTCOME_RECORDED"
  | string;

export type OpsFollowupPriorityBand = "LOW" | "MEDIUM" | "HIGH" | "URGENT" | string;

export type OpsFollowupsQueueOwnerRef = {
  ownerType: "user";
  ownerId: string;
};

export type OpsFollowupsQueueItem = {
  visitorId: string;
  assignedTo: OpsFollowupsQueueOwnerRef | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupContactedAt: string | null;
  lastFollowupOutcomeAt: string | null;
  stage: string | null;
  lastFormationEventType?: string | null;
  lastFormationEventAt?: string | null;
  lastActorId?: string | null;
  needsFollowup: boolean;
  followupReason?: OpsFollowupReason;
  followupResolved: boolean;
  resolvedForAssignment: boolean;
  followupUrgency?: FollowupUrgency;
  followupPriorityScore?: number;
  followupAgingBucket?: FollowupAgingBucket;
  followupEscalated: boolean;
  followupOverdue: boolean;
  engagementRiskLevel?: string | null;
  engagementRiskScore?: number | null;
  priorityBand?: OpsFollowupPriorityBand | null;
  priorityReason?: string | null;
  lastActivityAt?: string | null;
};

export type OpsFollowupsQueueStats = {
  total: number;
  resolved: number;
  escalated: number;
  overdue: number;
  atRisk: number;
  onTrack: number;
};

export type OpsFollowupsQueueOwnerStats = {
  ownerId: string;
  total: number;
  resolved: number;
  overdue: number;
  atRisk: number;
  onTrack: number;
};

export type OpsFollowupsQueueResult = {
  assignedTo: string | null;
  cursor: string;
  visitorId: string | null;
  includeResolved: boolean;
  nextCursor: string | null;
  stats: OpsFollowupsQueueStats;
  owners: OpsFollowupsQueueOwnerStats[];
  items: OpsFollowupsQueueItem[];
};
