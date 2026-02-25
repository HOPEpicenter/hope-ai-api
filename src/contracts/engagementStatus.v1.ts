export type EngagementStatusResponseV1 = {
  v: 1;
  visitorId: string;
  status: string | null;
  lastChangedAt: string | null;
  lastEventId: string | null;
};

export type ValidationIssue = { path: string; message: string };
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateEngagementStatusQueryV1(query: unknown): ValidationResult<{ visitorId: string }> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(query)) return { ok: false, issues: [{ path: "", message: "query must be an object" }] };

  const visitorId = query.visitorId;
  if (typeof visitorId !== "string" || visitorId.length < 8) {
    issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { visitorId: visitorId as string } };
}

// POST /engagements/status/transitions
export type EngagementStatusTransitionRequestV1 = {
  visitorId: string;
  to: string;
  reason?: string;
};

export function validateEngagementStatusTransitionRequestV1(
  body: unknown
): ValidationResult<EngagementStatusTransitionRequestV1> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(body)) return { ok: false, issues: [{ path: "", message: "body must be an object" }] };

  const visitorId = body.visitorId;
  const to = body.to;
  const reason = body.reason;

  if (typeof visitorId !== "string" || visitorId.length < 8) {
    issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });
  }
  if (typeof to !== "string" || to.length < 1 || to.length > 64) {
    issues.push({ path: "to", message: "must be a string (1-64 chars)" });
  }
  if (reason !== undefined && (typeof reason !== "string" || reason.length > 256)) {
    issues.push({ path: "reason", message: "must be a string (<=256 chars) if provided" });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { visitorId: visitorId as string, to: to as string, reason: reason as any } };
}
