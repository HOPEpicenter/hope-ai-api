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

function normalizeGroupRefs(value: unknown): GroupRefV1[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const refs = value
    .map((item: any) => {
      const groupId = String(item?.groupId ?? "").trim();
      const displayName = String(item?.displayName ?? "").trim();
      if (!groupId) return null;
      return displayName ? { groupId, displayName } : { groupId };
    })
    .filter(Boolean) as GroupRefV1[];

  return refs.length ? refs : undefined;
}

function normalizeProgramRefs(value: unknown): ProgramRefV1[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const refs = value
    .map((item: any) => {
      const programId = String(item?.programId ?? "").trim();
      const displayName = String(item?.displayName ?? "").trim();
      if (!programId) return null;
      return displayName ? { programId, displayName } : { programId };
    })
    .filter(Boolean) as ProgramRefV1[];

  return refs.length ? refs : undefined;
}

function normalizeWorkflowRefs(value: unknown): WorkflowRefV1[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const refs = value
    .map((item: any) => {
      const workflowId = String(item?.workflowId ?? "").trim();
      const displayName = String(item?.displayName ?? "").trim();
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

  const assignedTo: OwnerRefV1 | undefined =
    assignedToUserId
      ? {
          ownerType: "user",
          ownerId: assignedToUserId,
        }
      : undefined;

  const hasAssignee = !!assignedTo;
  const lastIntegratedAt = maxIso(input.lastEngagementAt, input.lastFormationAt);
  const groups = normalizeGroupRefs(input.groups);
  const programs = normalizeProgramRefs(input.programs);
  const workflowRefs = normalizeWorkflowRefs(input.workflows);
  const needsFollowup = !!hasAssignee || !input.lastEngagementAt;
  const followupReason = hasAssignee
    ? "FOLLOWUP_ASSIGNED"
    : !input.lastEngagementAt
      ? "no_engagement_yet"
      : undefined;

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
    assignedTo,
    groups,
    programs,
    workflows,
  };
}