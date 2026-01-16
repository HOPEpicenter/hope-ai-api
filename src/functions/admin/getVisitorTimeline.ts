// src/functions/admin/getVisitorTimeline.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";

import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { makeTableClient } from "../../shared/storage/makeTableClient";
import { tableName } from "../../storage/tableName";

import {
  decodeCursor,
  encodeCursor,
  listByVisitorWithFallback,
  cursorFromLast,
  getRowKey,
  TimelineCursor
} from "../../shared/timeline/timelineQuery";

const FORMATION_EVENTS_TABLE = "FormationEvents";
const ENGAGEMENTS_TABLE = "Engagements";

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parsePositiveInt(val: string | null, fallback: number): number {
  if (!val) return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function getConnectionString(): string {
  const cs = process.env.STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error("Missing STORAGE_CONNECTION_STRING.");
  return cs;
}

function getFormationEventsTableClient(cs?: string): TableClient {
  const conn = cs ?? getConnectionString();
  return makeTableClient(conn, tableName(FORMATION_EVENTS_TABLE));
}

function getEngagementsTableClient(cs?: string): TableClient {
  const conn = cs ?? getConnectionString();
  return makeTableClient(conn, tableName(ENGAGEMENTS_TABLE));
}

function buildEngagementDisplay(eventType: unknown, notes: unknown): string {
  const n = cleanSpaces(safeStr(notes));
  if (n) return n;
  const t = cleanSpaces(safeStr(eventType));
  return t ? `${t} (engagement)` : "engagement";
}

function buildFormationDisplay(type: unknown, metadata: any): string {
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

function parseKinds(raw: string | null): Array<"formation" | "engagement"> {
  const s = (raw ?? "").trim();
  if (!s) return ["formation", "engagement"];

  const parts = s.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  const out: Array<"formation" | "engagement"> = [];
  for (const p of parts) {
    if (p === "formation" || p === "engagement") out.push(p);
  }
  return out.length ? out : ["formation", "engagement"];
}

function pickOccurredAt(row: any): string | null {
  const o = row?.occurredAt;
  if (typeof o === "string" && o) return o;
  const r = row?.recordedAt;
  if (typeof r === "string" && r) return r;
  const u = row?.updatedAt;
  if (typeof u === "string" && u) return u;
  return null;
}

function pickRecordedAt(row: any): string | null {
  const r = row?.recordedAt;
  if (typeof r === "string" && r) return r;
  const u = row?.updatedAt;
  if (typeof u === "string" && u) return u;
  return null;
}

function normalizeMetadata(meta: any): Record<string, any> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta;
  return {};
}

function parseMetadataFromRow(row: any): Record<string, any> {
  const metaRaw = row?.metadata ?? row?.meta ?? null;

  if (metaRaw && typeof metaRaw === "object") return normalizeMetadata(metaRaw);

  if (typeof metaRaw === "string" && metaRaw.trim()) {
    try {
      return normalizeMetadata(JSON.parse(metaRaw));
    } catch {
      return { raw: metaRaw };
    }
  }

  return {};
}

type TimelineItemInternal = {
  kind: "formation" | "engagement";
  rk: string;
  occurredAt: string | null;
  recordedAt: string | null;
  type: string | null;
  display: string;
  metadata: Record<string, any>;
};

function sortDesc(a: TimelineItemInternal, b: TimelineItemInternal): number {
  const at = a.occurredAt ?? "";
  const bt = b.occurredAt ?? "";
  if (at !== bt) return at < bt ? 1 : -1;

  const ar = a.recordedAt ?? "";
  const br = b.recordedAt ?? "";
  if (ar !== br) return ar < br ? 1 : -1;

  if (a.rk !== b.rk) return a.rk < b.rk ? 1 : -1;
  if (a.kind !== b.kind) return a.kind < b.kind ? 1 : -1;
  return 0;
}

app.http("getVisitorTimeline", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ops/visitors/{visitorId}/timeline",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const visitorIdRaw = req.params?.visitorId ?? "";
    const visitorId = String(visitorIdRaw).trim();
    if (!visitorId) return badRequest("Path parameter 'visitorId' is required.");

    const kinds = parseKinds(req.query.get("kinds"));
    const limit = parsePositiveInt(req.query.get("limit"), 10);
    const debugEnabled = (req.query.get("debug") ?? "") === "1";

    const cursorRaw = req.query.get("cursor");
    const cursorDecoded = cursorRaw ? decodeCursor(cursorRaw) : null;
    const cursor: TimelineCursor | null = cursorDecoded;

    const perTableMax = Math.max(50, limit * 5);

    const items: TimelineItemInternal[] = [];

    let formationDebug: any = null;
    let engagementDebug: any = null;

    if (kinds.includes("formation")) {
      const table = getFormationEventsTableClient();
      await ensureTableExists(table);

      const res = await listByVisitorWithFallback<any>(table, visitorId, cursor, perTableMax);
      formationDebug = { usedStrategy: res.usedStrategy, usedFilter: res.usedFilter, fetched: res.rows.length };

      for (const row of res.rows) {
        const metaObj = parseMetadataFromRow(row);
        const type = (row as any).type ?? (row as any).eventType ?? null;
        const rk = getRowKey(row);

        items.push({
          kind: "formation",
          rk,
          occurredAt: pickOccurredAt(row),
          recordedAt: pickRecordedAt(row),
          type: typeof type === "string" ? type : null,
          display: buildFormationDisplay(type, metaObj),
          metadata: metaObj
        });
      }
    }

    if (kinds.includes("engagement")) {
      const table = getEngagementsTableClient();
      await ensureTableExists(table);

      const res = await listByVisitorWithFallback<any>(table, visitorId, cursor, perTableMax);
      engagementDebug = { usedStrategy: res.usedStrategy, usedFilter: res.usedFilter, fetched: res.rows.length };

      for (const row of res.rows) {
        const type = (row as any).eventType ?? (row as any).type ?? null;
        const notes = (row as any).notes ?? "";
        const rk = getRowKey(row);

        items.push({
          kind: "engagement",
          rk,
          occurredAt: pickOccurredAt(row),
          recordedAt: pickRecordedAt(row),
          type: typeof type === "string" ? type : null,
          display: buildEngagementDisplay(type, notes),
          metadata: {}
        });
      }
    }

    items.sort(sortDesc);

    const returned = items.slice(0, limit);

    // Cursor for page2+: encode time anchor + rk tie-breaker from the LAST returned item
    let nextCursor: string | null = null;
    if (returned.length === limit) {
      const last = returned[returned.length - 1];

      // We need occurredAt + rk in cursor.
      const c = { t: last.occurredAt ?? undefined, rk: last.rk || undefined };
      if (c.t || c.rk) nextCursor = encodeCursor(c);
    }

    const response: any = {
      ok: true,
      visitorId,
      kinds,
      limit,
      cursor: cursorRaw ?? null,
      cursorValid: cursorRaw ? !!cursorDecoded : null,
      nextCursor,
      items: returned.map(i => {
        const { rk, ...rest } = i as any;
        return rest;
      })
    };

    if (debugEnabled) {
      response.debug = {
        cursorRaw: cursorRaw ?? null,
        cursorDecoded,
        perTableMax,
        returnedRks: returned.map(x => x.rk).filter(Boolean),
        queries: {
          formation: formationDebug,
          engagement: engagementDebug
        },
        tables: {
          formation: tableName(FORMATION_EVENTS_TABLE),
          engagement: tableName(ENGAGEMENTS_TABLE)
        }
      };
    }

    return { status: 200, jsonBody: response };
  }
});
