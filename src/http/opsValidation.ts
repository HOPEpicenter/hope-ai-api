import { badRequest } from "./apiError";

export type VisitorIdResult = { visitorId: string };

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function readFirstString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = readString(obj, k);
    if (typeof s === "string" && s.length > 0) return s;
  }
  return undefined;
}

export function parseVisitorId(params: unknown): VisitorIdResult {
  const p = asRecord(params);
  const vid = readString(p, "vid");
  const id = readString(p, "id");
  const visitorId = (vid && vid.trim()) || (id && id.trim()) || "";
  if (!visitorId) throw badRequest("visitor id is required");
  return { visitorId };
}

/**
 * limit parser:
 * - prefers "limit"
 * - also accepts "timelineLimit" (legacy)
 * - caps at 200
 */
export function parseLimit(query: unknown, fallback: number): number {
  const q = asRecord(query);
  const raw = readFirstString(q, ["limit", "timelineLimit"]);
  if (!raw) return fallback;

  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;

  const m = Math.floor(n);
  return Math.max(1, Math.min(200, m));
}

/**
 * cursor parser:
 * - prefers "cursor"
 * - also accepts "timelineCursor" (legacy)
 */
export function parseCursor(query: unknown): string | null {
  const q = asRecord(query);
  const raw = readFirstString(q, ["cursor", "timelineCursor"]);
  return raw && raw.length > 0 ? raw : null;
}

export type CreateVisitorBody = { name: string; email?: string };

export function parseCreateVisitorBody(body: unknown): CreateVisitorBody {
  const b = asRecord(body);
  const name = (readString(b, "name") || "").trim();
  const email = (readString(b, "email") || "").trim();

  if (!name) throw badRequest("Missing required field 'name'.");

  return {
    name,
    email: email.length > 0 ? email : undefined,
  };
}

export type AppendEventBody = {
  type: string;
  occurredAt?: string;
  summary?: string;
  metadata?: unknown;
};

export function parseAppendEventBody(body: unknown): AppendEventBody {
  const b = asRecord(body);
  const type = readString(b, "type");
  const occurredAt = readString(b, "occurredAt");
  const summary = readString(b, "summary");
  const metadata = b["metadata"];

  if (!type || type.trim().length === 0) {
    throw badRequest("Invalid or missing 'type'.");
  }

  return {
    type: type.trim(),
    occurredAt: occurredAt && occurredAt.trim().length > 0 ? occurredAt : undefined,
    summary: summary && summary.trim().length > 0 ? summary : undefined,
    metadata: metadata !== undefined ? metadata : undefined,
  };
}
