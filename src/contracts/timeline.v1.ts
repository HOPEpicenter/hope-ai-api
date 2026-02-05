export type TimelineQueryV1 = {
  visitorId: string;
  limit: number;
  cursor?: string;
};

export type TimelineCursorV1 = {
  visitorId: string;
  after: string; // implementation-defined (rowKey)
};

export type ValidationIssue = { path: string; message: string };
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function encodeCursorV1(c: TimelineCursorV1): string {
  const json = JSON.stringify(c);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursorV1(cursor: string): TimelineCursorV1 {
  const json = Buffer.from(cursor, "base64url").toString("utf8");
  const obj = JSON.parse(json);
  if (!obj || typeof obj.visitorId !== "string" || typeof obj.after !== "string") {
    throw new Error("Invalid cursor");
  }
  return obj as TimelineCursorV1;
}

export function validateTimelineQueryV1(query: unknown): ValidationResult<TimelineQueryV1> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(query)) return { ok: false, issues: [{ path: "", message: "query must be an object" }] };

  const visitorId = query.visitorId;
  const limitRaw = query.limit;
  const cursor = query.cursor;

  if (typeof visitorId !== "string" || visitorId.length < 8) issues.push({ path: "visitorId", message: "must be a string (min 8 chars)" });

  let limit = 50;
  if (limitRaw !== undefined) {
    const n = Number(limitRaw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) issues.push({ path: "limit", message: "must be an integer" });
    else limit = n;
  }

  if (limit < 1) limit = 1;
  if (limit > 200) limit = 200;

  if (cursor !== undefined && typeof cursor !== "string") issues.push({ path: "cursor", message: "must be a string if provided" });

  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, value: { visitorId: visitorId as string, limit, cursor: cursor as any } };
}

