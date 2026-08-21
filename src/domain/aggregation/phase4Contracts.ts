/**
 * Phase 4 Integration Aggregation contracts.
 *
 * Contract-only: PR-1 adds no routes, reads, projection logic, or UI behavior.
 * The canonical timeline remains engagement + formation. Six-week follow-up
 * contributes snapshot and readiness information only.
 */
export const PERSON_AGGREGATION_SCHEMA_VERSION = 1 as const;
export const SNAPSHOT_RAIL_V2_SCHEMA_VERSION = 2 as const;

export type TimelineStream = "engagement" | "formation";
export type ReadinessSource = TimelineStream | "six_week_followup";

export enum TimelineEventType {
  NOTE_ADDED = "note.add",
  NOTE_UPDATED = "note.updated",
  STATUS_TRANSITION = "status.transition",
  TAG_ADDED = "tag.add",
  TAG_REMOVED = "tag.remove",

  SERVICE_ATTENDED = "SERVICE_ATTENDED",
  FOLLOWUP_ASSIGNED = "FOLLOWUP_ASSIGNED",
  FOLLOWUP_UNASSIGNED = "FOLLOWUP_UNASSIGNED",
  FOLLOWUP_CONTACTED = "FOLLOWUP_CONTACTED",
  FOLLOWUP_OUTCOME_RECORDED = "FOLLOWUP_OUTCOME_RECORDED",
  NEXT_STEP_SELECTED = "NEXT_STEP_SELECTED",
  NEXT_STEP_COMPLETED = "NEXT_STEP_COMPLETED",
  INFO_REQUESTED = "INFO_REQUESTED",
  PRAYER_REQUESTED = "PRAYER_REQUESTED",
  GROUP_JOINED = "GROUP_JOINED",
  GROUP_LEFT = "GROUP_LEFT",
  SALVATION_RECORDED = "SALVATION_RECORDED",
  BAPTISM_RECORDED = "BAPTISM_RECORDED",
  MEMBERSHIP_RECORDED = "MEMBERSHIP_RECORDED",
}

export type TimelineActorRef = {
  system: string;
  actorId: string | null;
};

export type TimelineNotePayload = {
  noteId: string;
  text: string;
  visibility: "team" | "private";
  version: number;
  reason: string | null;
};

export type TimelineStatusTransitionPayload = {
  from: "ENGAGED" | "DISENGAGED" | null;
  to: "ENGAGED" | "DISENGAGED";
  reason: string | null;
};

export type TimelineTagPayload = {
  tag: string;
};

export type TimelineFollowupAssignedPayload = {
  assigneeId: string;
  assigneeName: string | null;
  dueAt: string | null;
};

export type TimelineFollowupContactedPayload = {
  method: "text" | "call" | "email" | "in_person";
  result: "connected" | "left_message" | "no_answer" | "wrong_number" | "email_bounced";
  notes: string | null;
};

export type TimelineFollowupOutcomePayload = {
  outcome: string;
  nextAction: string | null;
  nextActionDueAt: string | null;
  notes: string | null;
};

export type TimelineNextStepPayload = {
  nextStep: string;
  details: string | null;
  completed: boolean;
};

export type TimelineGroupPayload = {
  groupId: string;
  displayName: string | null;
};

export type TimelineGenericPayload = {
  metadata: Record<string, unknown> | null;
};

export type TimelineEventBase<TType extends TimelineEventType, TPayload> = {
  eventId: string;
  visitorId: string;
  type: TType;
  stream: TimelineStream;
  sourceType: string;
  occurredAt: string;
  recordedAt: string | null;
  summary: string | null;
  source: TimelineActorRef | null;
  payload: TPayload;
};

export type TimelineEvent =
  | TimelineEventBase<
      TimelineEventType.NOTE_ADDED | TimelineEventType.NOTE_UPDATED,
      TimelineNotePayload
    >
  | TimelineEventBase<TimelineEventType.STATUS_TRANSITION, TimelineStatusTransitionPayload>
  | TimelineEventBase<
      TimelineEventType.TAG_ADDED | TimelineEventType.TAG_REMOVED,
      TimelineTagPayload
    >
  | TimelineEventBase<TimelineEventType.FOLLOWUP_ASSIGNED, TimelineFollowupAssignedPayload>
  | TimelineEventBase<TimelineEventType.FOLLOWUP_CONTACTED, TimelineFollowupContactedPayload>
  | TimelineEventBase<TimelineEventType.FOLLOWUP_OUTCOME_RECORDED, TimelineFollowupOutcomePayload>
  | TimelineEventBase<
      TimelineEventType.NEXT_STEP_SELECTED | TimelineEventType.NEXT_STEP_COMPLETED,
      TimelineNextStepPayload
    >
  | TimelineEventBase<
      TimelineEventType.GROUP_JOINED | TimelineEventType.GROUP_LEFT,
      TimelineGroupPayload
    >
  | TimelineEventBase<
      | TimelineEventType.SERVICE_ATTENDED
      | TimelineEventType.FOLLOWUP_UNASSIGNED
      | TimelineEventType.INFO_REQUESTED
      | TimelineEventType.PRAYER_REQUESTED
      | TimelineEventType.SALVATION_RECORDED
      | TimelineEventType.BAPTISM_RECORDED
      | TimelineEventType.MEMBERSHIP_RECORDED,
      TimelineGenericPayload
    >;

export type SnapshotRailV2 = {
  schemaVersion: typeof SNAPSHOT_RAIL_V2_SCHEMA_VERSION;
  visitorId: string;
  generatedAt: string;
  formationStage: "Visitor" | "Guest" | "Connected" | "UNKNOWN" | null;
  formationStageUpdatedAt: string | null;
  engagementStatus: "ENGAGED" | "DISENGAGED" | null;
  lastEngagedAt: string | null;
  engagementRiskLevel: "low" | "medium" | "high" | null;
  engagementRiskScore: number | null;
  followupNeeded: boolean | null;
  followupResolved: boolean | null;
  followupUrgency: "ON_TRACK" | "AT_RISK" | "OVERDUE" | null;
  followupOwnerId: string | null;
  sixWeekPlanStatus: "active" | "paused" | "completed" | "cancelled" | null;
  sixWeekNextTaskDueDate: string | null;
  sixWeekNeedsOwner: boolean | null;
  lastFormationAt: string | null;
  lastIntegratedAt: string | null;
  lastPrayerRequestedAt: string | null;
};

export type MinistryHealthScore = {
  score: number;
  band: "HEALTHY" | "WATCH" | "NEEDS_ATTENTION";
  reasons: string[];
  calculatedAt: string;
};

export enum ReadinessSignal {
  ENGAGEMENT_RISK_HIGH = "ENGAGEMENT_RISK_HIGH",
  ENGAGEMENT_RISK_MEDIUM = "ENGAGEMENT_RISK_MEDIUM",
  NEEDS_FOLLOWUP = "NEEDS_FOLLOWUP",
  FOLLOWUP_AT_RISK = "FOLLOWUP_AT_RISK",
  FOLLOWUP_OVERDUE = "FOLLOWUP_OVERDUE",
  FOLLOWUP_NEEDS_OWNER = "FOLLOWUP_NEEDS_OWNER",
  SIX_WEEK_TASK_DUE = "SIX_WEEK_TASK_DUE",
  SIX_WEEK_TASK_OVERDUE = "SIX_WEEK_TASK_OVERDUE",
  PRAYER_REQUESTED = "PRAYER_REQUESTED",
  NEXT_STEP_PENDING = "NEXT_STEP_PENDING",
}

export type ReadinessSignalItem = {
  signal: ReadinessSignal;
  detectedAt: string;
  priority: "routine" | "elevated" | "urgent";
  reason: string;
  source: ReadinessSource;
};

export type PersonAggregate = {
  schemaVersion: typeof PERSON_AGGREGATION_SCHEMA_VERSION;
  visitorId: string;
  generatedAt: string;
  sources: {
    engagement: boolean;
    formation: boolean;
    sixWeekFollowup: boolean;
  };
  snapshot: SnapshotRailV2;
  ministryHealth: MinistryHealthScore;
  readiness: ReadinessSignalItem[];
  timeline: TimelineEvent[];
};
