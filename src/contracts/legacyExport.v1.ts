export type ValidationIssue = { path: string; message: string };
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function validateLegacyExportQueryV1(query: unknown): ValidationResult<{ visitorId: string; limit: number }> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(query)) return { ok: false, issues: [{ path: "", message: "query must be an object" }] };

  const visitorId = query.visitorId;
  if (typeof visitorId !== "string" || visitorId.length < 8) {
    issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });
  }

  const limitRaw = query.limit;
  let limit = 500;
  if (typeof limitRaw === "string" && limitRaw.trim().length > 0) {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      issues.push({ path: "limit", message: "must be an integer" });
    } else {
      limit = Math.max(1, Math.min(n, 1000));
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { visitorId: visitorId as string, limit } };
}
