// src/shared/timeline/timelineMapping.ts

export type TimelineKind = "formation" | "engagement";

export type TimelineItemCore = {
  rk: string; // stable cursor key (RowKey-ish)
  kind: TimelineKind;
  occurredAt: string | null;
  recordedAt: string | null;
  type: string | null;
  display: string;
  metadata: any; // always an object (never null)
};

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseMaybeJson(val: any): any {
  if (val == null) return null;
  if (typeof val === "object") return val;
  if (typeof val !== "string") return { raw: val };
  const s = val.trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === "object" ? parsed : { value: parsed };
  } catch {
    return { raw: val };
  }
}

export function pickOccurredAt(row: any): string | null {
  const o = row?.occurredAt;
  if (typeof o === "string" && o) return o;

  const r = row?.recordedAt;
  if (typeof r === "string" && r) return r;

  const u = row?.updatedAt;
  if (typeof u === "string" && u) return u;

  const ts = row?.timestamp;
  if (typeof ts === "string" && ts) return ts;

  return null;
}

export function pickRecordedAt(row: any): string | null {
  const r = row?.recordedAt;
  if (typeof r === "string" && r) return r;

  const u = row?.updatedAt;
  if (typeof u === "string" && u) return u;

  const ts = row?.timestamp;
  if (typeof ts === "string" && ts) return ts;

  return null;
}

export function rowKeyOf(row: any): string {
  return (
    safeStr(row?.rowKey) ||
    safeStr(row?.RowKey) ||
    safeStr(row?.eventId) ||
    safeStr(row?.engagementId) ||
    safeStr(row?.id) ||
    ""
  );
}

export function buildEngagementDisplay(eventType: unknown, notes: unknown): string {
  const n = cleanSpaces(safeStr(notes));
  if (n) return n;

  const t = cleanSpaces(safeStr(eventType));
  return t ? `${t} (engagement)` : "engagement";
}

export function buildFormationDisplay(type: unknown, metadata: any): string {
  const t = cleanSpaces(safeStr(type)) || "formation";

  const assigneeId = cleanSpaces(safeStr(metadata?.assigneeId));
  const channel = cleanSpaces(safeStr(metadata?.channel));
  const notes = cleanSpaces(safeStr(metadata?.notes));

  if (t === "FOLLOWUP_ASSIGNED") {
    const who = assigneeId ? ` -> ${assigneeId}` : "";
    const ch = channel ? ` (${channel})` : "";
    const tail = notes ? ` - ${notes}` : "";
    return `${t}${who}${ch}${tail}`;
  }

  const ch = channel ? ` (${channel})` : "";
  const tail = notes ? ` - ${notes}` : "";
  return `${t}${ch}${tail}`;
}

export function mapFormationRow(row: any): TimelineItemCore {
  const metaRaw = row?.metadata ?? row?.meta ?? row?.Metadata ?? row?.metaJson ?? null;
  const metaObj = parseMaybeJson(metaRaw) || {};

  const type = row?.type ?? row?.eventType ?? row?.Type ?? null;

  const occurredAt = pickOccurredAt(row);
  const recordedAt = pickRecordedAt(row);

  const rk = rowKeyOf(row) || (occurredAt ? `${occurredAt}__formation` : "");

  return {
    rk,
    kind: "formation",
    occurredAt,
    recordedAt,
    type: typeof type === "string" ? type : type == null ? null : String(type),
    display: buildFormationDisplay(type, metaObj),
    metadata: metaObj || {},
  };
}

export function mapEngagementRow(row: any): TimelineItemCore {
  const type = row?.eventType ?? row?.type ?? row?.Type ?? null;
  const notes = row?.notes ?? row?.Notes ?? "";

  const occurredAt = pickOccurredAt(row);
  const recordedAt = pickRecordedAt(row);

  const rk = rowKeyOf(row) || (occurredAt ? `${occurredAt}__engagement` : "");

  return {
    rk,
    kind: "engagement",
    occurredAt,
    recordedAt,
    type: typeof type === "string" ? type : type == null ? null : String(type),
    display: buildEngagementDisplay(type, notes),
    metadata: {}, // engagement metadata can be added later; keep stable object
  };
}

export function sortTimelineDesc(a: TimelineItemCore, b: TimelineItemCore): number {
  const at = a.occurredAt ?? "";
  const bt = b.occurredAt ?? "";
  if (at !== bt) return at < bt ? 1 : -1;

  const ar = a.recordedAt ?? "";
  const br = b.recordedAt ?? "";
  if (ar !== br) return ar < br ? 1 : -1;

  // stabilize by kind then rk
  if (a.kind !== b.kind) return a.kind < b.kind ? 1 : -1;
  if (a.rk !== b.rk) return a.rk < b.rk ? 1 : -1;

  return 0;
}
