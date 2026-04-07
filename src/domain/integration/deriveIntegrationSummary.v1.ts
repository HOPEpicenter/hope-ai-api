import type {
  GroupRefV1,
  IntegrationSummaryV1,
  ProgramRefV1,
  WorkflowRefV1,
} from "../../contracts/integrationSummary.v1";

type OwnerRefV1 = {
  ownerType: "user" | "team";
  ownerId: string;
  displayName?: string;
};

export type DeriveIntegrationSummaryInput = {
  visitorId: string;
  lastEngagementAt: string | null;
  lastFormationAt: string | null;
  assignedToUserId?: string | null;
  lastFollowupAssignedAt?: string | null;
  lastFollowupContactedAt?: string | null;
  lastFollowupOutcomeAt?: string | null;
  groups?: unknown;
  programs?: unknown;
  workflows?: unknown;
};

function maxIso(a?: string | null, b?: string | null): string | null {
  const av = String(a ?? "").trim();
  const bv = String(b ?? "").trim();
  if (!av) return bv || null;
  if (!bv) return av || null;
  return av >= bv ? av : bv;
}

function hoursBetween(a: string, b: string): number {
  const ams = Date.parse(a);
  const bms = Date.parse(b);
  if (Number.isNaN(ams) || Number.isNaN(bms)) return 0;
  return (bms - ams) / (1000 * 60 * 60);
}

function normalizeGroupRefs(value: unknown): GroupRefV1[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs = value
    .map((i: any) => {
      const groupId = String(i?.groupId ?? "").trim();
      const displayName = String(i?.displayName ?? "").trim();
      if (!groupId) return null;
      return displayName ? { groupId, displayName } : { groupId };
    })
    .filter(Boolean) as GroupRefV1[];
  return refs.length ? refs : undefined;
}

function normalizeProgramRefs(value: unknown): ProgramRefV1[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs = value
    .map((i: any) => {
      const programId = String(i?.programId ?? "").trim();
      const displayName = String(i?.displayName ?? "").trim();
      if (!programId) return null;
      return displayName ? { programId, displayName } : { programId };
    })
    .filter(Boolean) as ProgramRefV1[];
  return refs.length ? refs : undefined;
}

function normalizeWorkflowRefs(value: unknown): WorkflowRefV1[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs = value
    .map((i: any) => {
      const workflowId = String(i?.workflowId ?? "").trim();
      const displayName = String(i?.displayName ?? "").trim();
      if (!workflowId) return null;
      return displayName ? { workflowId, displayName } : { workflowId };
    })
    .filter(Boolean) as WorkflowRefV1[];
  return refs.length ? refs : undefined;
}

export function deriveIntegrationSummaryV1(
  input: DeriveIntegrationSummaryInput
): IntegrationSummaryV1 {
  const assignedToUserId = String(input.assignedToUserId ?? "").trim();
  const hasAssignee = !!assignedToUserId;

  const assignedAt = input.lastFollowupAssignedAt;
  const outcomeAt = input.lastFollowupOutcomeAt;

  const followupResolved =
    !!assignedAt &&
    !!outcomeAt &&
    outcomeAt >= assignedAt;

  let followupUrgency: "ON_TRACK" | "AT_RISK" | "OVERDUE" | undefined;
  let followupOverdue = false;
  let followupPriorityScore: number | undefined;
  let followupAgingBucket: "SAME_DAY" | "ONE_DAY" | "TWO_PLUS_DAYS" | undefined;
  let followupEscalated = false;

  if (assignedAt && !followupResolved) {
    const ageHours = hoursBetween(assignedAt, new Date().toISOString());

    if (ageHours >= 48) {
      followupUrgency = "OVERDUE";
      followupOverdue = true;
      followupPriorityScore = 90;
      followupAgingBucket = "TWO_PLUS_DAYS";
      followupEscalated = true;
    } else if (ageHours >= 24) {
      followupUrgency = "AT_RISK";
      followupOverdue = false;
      followupPriorityScore = 60;
      followupAgingBucket = "ONE_DAY";
      followupEscalated = false;
    } else {
      followupUrgency = "ON_TRACK";
      followupOverdue = false;
      followupPriorityScore = 25;
      followupAgingBucket = "SAME_DAY";
      followupEscalated = false;
    }
  }

  const assignedTo: OwnerRefV1 | undefined =
    followupResolved
      ? undefined
      : assignedToUserId
        ? { ownerType: "user", ownerId: assignedToUserId }
        : undefined;

  let needsFollowup: boolean;

  if (followupResolved) {
    needsFollowup = false;
  } else if (hasAssignee) {
    needsFollowup = true;
  } else if (!input.lastEngagementAt) {
    needsFollowup = true;
  } else {
    needsFollowup = false;
  }

  const lastIntegratedAt = maxIso(input.lastEngagementAt, input.lastFormationAt);
  const groups = normalizeGroupRefs(input.groups);
  const programs = normalizeProgramRefs(input.programs);
  const workflowRefs = normalizeWorkflowRefs(input.workflows);

  let followupReason: string | undefined;

  if (followupResolved) {
    followupReason = "FOLLOWUP_OUTCOME_RECORDED";
  } else if (input.lastFollowupContactedAt) {
    followupReason = "FOLLOWUP_CONTACTED";
  } else if (hasAssignee) {
    followupReason = "FOLLOWUP_ASSIGNED";
  } else if (!input.lastEngagementAt) {
    followupReason = "no_engagement_yet";
  }

  const workflows =
    workflowRefs ??
    (needsFollowup
      ? [{ workflowId: "followup", displayName: "Follow-up" }]
      : undefined);

  return {
    visitorId: input.visitorId,
    lastEngagementAt: input.lastEngagementAt,
    lastFormationAt: input.lastFormationAt,
    lastIntegratedAt,
    sources: {
      engagement: !!input.lastEngagementAt,
      formation: !!input.lastFormationAt,
    },
    needsFollowup,
    followupReason,
    followupResolved,
    followupOverdue,
    followupUrgency,
    followupPriorityScore,
    followupAgingBucket,
    followupEscalated,
    assignedTo,
    groups,
    programs,
    workflows,
  };
}