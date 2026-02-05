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
