// src/functions/admin/getVisitorTimeline.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { makeTableClient } from "../../shared/storage/makeTableClient";
import { tableName } from "../../storage/tableName";

type TimelineKind = "formation" | "engagement";

type TimelineItem = {
  kind: TimelineKind;
  occurredAt: string | null;
  recordedAt: string | null;
  type?: string | null;
  display?: string | null;
  metadata?: any;
  // NOTE: in your runtime, entities expose camelCase keys
  rowKey?: string | null;
};

type CursorPayload = { t: string; rk: string };

function parsePositiveInt(val: string | null | undefined, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseKinds(raw: string | null): TimelineKind[] {
  if (!raw) return ["formation", "engagement"];
  const parts = raw
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const kinds = new Set<TimelineKind>();
  for (const p of parts) {
    if (p === "formation") kinds.add("formation");
    if (p === "engagement") kinds.add("engagement");
  }
  return kinds.size ? Array.from(kinds) : ["formation", "engagement"];
}

function tryDecodeCursor(raw: string | null): CursorPayload | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (obj && typeof obj.t === "string" && typeof obj.rk === "string") return { t: obj.t, rk: obj.rk };
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function getConnectionString(): string {
  const cs = process.env.STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error("STORAGE_CONNECTION_STRING is missing");
  return cs;
}

function getFormationEventsTableClient(cs: string): TableClient {
  return makeTableClient(cs, tableName("FormationEvents"));
}

function getEngagementsTableClient(cs: string): TableClient {
  return makeTableClient(cs, tableName("Engagements"));
}

function normalizeIso(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  return null;
}

function buildOccurredAt(row: any): string | null {
  return (
    normalizeIso(row.occurredAt) ||
    normalizeIso(row.recordedAt) ||
    normalizeIso(row.createdAt) ||
    normalizeIso(row.timestamp) ||
    null
  );
}

function buildRecordedAt(row: any): string | null {
  return normalizeIso(row.recordedAt) || normalizeIso(row.createdAt) || normalizeIso(row.timestamp) || null;
}

function buildDisplay(row: any): string | null {
  if (typeof row.display === "string" && row.display.length) return row.display;
  if (typeof row.summary === "string" && row.summary.length) return row.summary;
  if (typeof row.notes === "string" && row.notes.length) return row.notes;
  return null;
}

function safeType(row: any): string | null {
  // formation uses `type`, engagement uses `eventType`
  if (typeof row.type === "string" && row.type.length) return row.type;
  if (typeof row.eventType === "string" && row.eventType.length) return row.eventType;
  return null;
}

function tryParseJson(val: any): any {
  if (typeof val !== "string") return val;
  const s = val.trim();
  if (!s) return val;
  // quick guard to avoid parsing simple strings
  if (s[0] !== "{" && s[0] !== "[") return val;
  try {
    return JSON.parse(s);
  } catch {
    return val;
  }
}

function compareDesc(a: TimelineItem, b: TimelineItem): number {
  const at = a.occurredAt || "";
  const bt = b.occurredAt || "";
  if (at < bt) return 1;
  if (at > bt) return -1;

  const ark = a.rowKey || "";
  const brk = b.rowKey || "";
  if (ark < brk) return 1;
  if (ark > brk) return -1;

  if (a.kind < b.kind) return 1;
  if (a.kind > b.kind) return -1;
  return 0;
}

async function fetchKindRows(
  kind: TimelineKind,
  client: TableClient,
  filter: string,
  maxRows: number
): Promise<TimelineItem[]> {
  const items: TimelineItem[] = [];

  // Manual limit (your typings don’t support `top`)
  const iter = client.listEntities<any>({ queryOptions: { filter } });

  for await (const row of iter) {
    items.push({
      kind,
      occurredAt: buildOccurredAt(row),
      recordedAt: buildRecordedAt(row),
      type: safeType(row),
      display: buildDisplay(row),
      metadata: row.metadata ?? row.meta ?? undefined,
      rowKey: (row as any).rowKey ?? null
    });

    if (items.length >= maxRows) break;
  }

  return items;
}

app.http("getVisitorTimeline", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ops/visitors/{visitorId}/timeline",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const visitorId = req.params.visitorId;
    if (!visitorId) return { status: 400, jsonBody: { ok: false, error: "visitorId is required" } };

    const limit = parsePositiveInt(req.query.get("limit"), 50);
    const kinds = parseKinds(req.query.get("kinds"));
    const debugOn = req.query.get("debug") === "1" || req.query.get("debug") === "true";

    const cursorRaw = req.query.get("cursor");
    const cursor = tryDecodeCursor(cursorRaw);

    // Exactly ONE declaration each
    const escapedVisitorId = String(visitorId).replace(/'/g, "''");
    const filter = `visitorId eq '${escapedVisitorId}'`;

    const cursorFilter =
      cursor && cursor.t && cursor.rk
        ? ` and (occurredAt lt '${String(cursor.t).replace(/'/g, "''")}' or (occurredAt eq '${String(
            cursor.t
          ).replace(/'/g, "''")}' and rowKey lt '${String(cursor.rk).replace(/'/g, "''")}'))`
        : "";

    const finalFilter = filter + cursorFilter;

    const cs = getConnectionString();
    const formationClient = getFormationEventsTableClient(cs);
    const engagementClient = getEngagementsTableClient(cs);

    await ensureTableExists(formationClient);
    await ensureTableExists(engagementClient);

    const perTableMax = Math.min(Math.max(limit * 3, 50), 500);

    let formationItems: TimelineItem[] = [];
    let engagementItems: TimelineItem[] = [];

    if (kinds.includes("formation")) {
      formationItems = await fetchKindRows("formation", formationClient, finalFilter, perTableMax);
    }
    if (kinds.includes("engagement")) {
      engagementItems = await fetchKindRows("engagement", engagementClient, finalFilter, perTableMax);
    }

    const merged = [...formationItems, ...engagementItems].sort(compareDesc);
    const page = merged.slice(0, limit);

    const last = page[page.length - 1];
    const nextCursor =
      page.length === limit && last && last.occurredAt && last.rowKey
        ? encodeCursor({ t: last.occurredAt, rk: last.rowKey })
        : null;

    const debug = debugOn
      ? {
          visitorId,
          kinds,
          limit,
          cursorRaw,
          cursorDecoded: cursor,
          escapedVisitorId,
          filter,
          finalFilter,
          perTableMax,
          counts: {
            formationFetched: formationItems.length,
            engagementFetched: engagementItems.length,
            merged: merged.length,
            returned: page.length
          },
          tables: {
            formation: formationClient.tableName,
            engagement: engagementClient.tableName
          }
        }
      : undefined;

    return {
      status: 200,
      jsonBody: {
        ok: true,
        visitorId,
        kinds,
        limit,
        cursor: cursorRaw ?? null,
        nextCursor,
        items: page.map(i => ({
          kind: i.kind,
          occurredAt: i.occurredAt,
          recordedAt: i.recordedAt,
          type: i.type ?? null,
          display: i.display ?? null,
          metadata: i.metadata === undefined ? undefined : tryParseJson(i.metadata)
        })),
        debug
      }
    };
  }
});
