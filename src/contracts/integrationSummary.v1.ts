export type IntegrationSummaryQueryV1 = {
  visitorId: string;
};

export type OwnerRefV1 = {
  ownerType: "user" | "team";
  ownerId: string;
  displayName?: string;
};

export type GroupRefV1 = { groupId: string; displayName?: string };
export type ProgramRefV1 = { programId: string; displayName?: string };
export type WorkflowRefV1 = { workflowId: string; displayName?: string };

export type IntegrationSummaryV1 = {
  visitorId: string;

  // Stream timestamps (nullable when stream has no events)
  lastEngagementAt: string | null;
  lastFormationAt: string | null;
  lastIntegratedAt: string | null;

  sources: {
    engagement: boolean;
    formation: boolean;
  };

  // Phase 4 additive fields (v1 docs contracts; may be unset)
  assignedTo?: OwnerRefV1;
  needsFollowup: boolean;
  followupReason?: string;
  followupResolved?: boolean;
  followupOverdue?: boolean;
  followupUrgency?: "ON_TRACK" | "AT_RISK" | "OVERDUE";
  followupPriorityScore?: number;
  followupAgingBucket?: "SAME_DAY" | "ONE_DAY" | "TWO_PLUS_DAYS";
  followupEscalated?: boolean;

  groups?: GroupRefV1[];
  programs?: ProgramRefV1[];
  workflows?: WorkflowRefV1[];
};

export type IntegrationSummaryResponseV1 = {
  ok: true;
  v: 1;
  visitorId: string;
  summary: IntegrationSummaryV1;
};

export type ValidationIssue = { path: string; message: string };
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateIntegrationSummaryQueryV1(
  query: unknown
): ValidationResult<IntegrationSummaryQueryV1> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(query)) {
    return { ok: false, issues: [{ path: "", message: "query must be an object" }] };
  }

  const visitorId = query.visitorId;

  if (typeof visitorId !== "string" || visitorId.length < 8) {
    issues.push({ path: "visitorId", message: "visitorId must be a string (len>=8)" });
  }

  if (issues.length > 0) return { ok: false, issues };
  const visitorIdStr = visitorId as string;
  return { ok: true, value: { visitorId: visitorIdStr } };
}

