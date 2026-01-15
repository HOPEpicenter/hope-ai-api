// src/functions/admin/getVisitorTimeline.ts

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";

import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { makeTableClient } from "../../shared/storage/makeTableClient";
import { tableName } from "../../storage/tableName";

import {
  TimelineItemCore,
  mapFormationRow,
  mapEngagementRow,
  sortTimelineDesc,
} from "../../shared/timeline/timelineMapping";

/**
 * =====================================================================================
 * Timeline endpoint (ops)
 *   GET /api/ops/visitors/{visitorId}/timeline?limit=10&kinds=formation,engagement&cursor=...
 * =====================================================================================
 *
 * Goals:
 * - Merge formation + engagement events into one reverse-chronological timeline.
 * - Always produce a non-null `display` string for each item.
 * - Support cursor pagination (older items).
 * - Include debug fields when debug=1.
 *
 * Cursor format: base64url(JSON) where JSON is { rk: "RowKey-ish" } (preferred)
 * Back-compat: if cursor contains { t: "occurredAtIso" }, we will best-effort filter by occurredAt.
 */

// ---------- config ----------
const FORMATION_EVENTS_TABLE = "FormationEvents"; // tableName() resolves dev/prod name
const ENGAGEMENTS_TABLE = "Engagements";

// ---------- helpers ----------
function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
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

// Cursor is base64url(JSON)
function b64urlEncode(obj: any): string {
  const json = JSON.stringify(obj);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(cursor: string): any | null {
  try {
    const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((cursor.length + 3) % 4);
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
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

function escapeODataString(val: string): string {
  return String(val).replace(/'/g, "''");
}

function buildVisitorFilter(visitorId: string): string {
  const esc = escapeODataString(visitorId);
  // robust across schemas: either visitorId property OR PartitionKey
  return `(visitorId eq '${esc}' or PartitionKey eq '${esc}')`;
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
    const cursorDecoded = cursorRaw ? b64urlDecode(cursorRaw) : null;

    const cursorRk = typeof cursorDecoded?.rk === "string" && cursorDecoded.rk ? String(cursorDecoded.rk) : null;
    const cursorT = typeof cursorDecoded?.t === "string" && cursorDecoded.t ? String(cursorDecoded.t) : null;

    // We pull more than limit from each table and then merge/sort.
    const perTableMax = Math.max(50, limit * 5);

    const baseFilter = buildVisitorFilter(visitorId);

    const items: TimelineItemCore[] = [];

    // ---------- Formation ----------
    let formationFetched = 0;
    let formationFilterUsed: string | null = null;

    if (kinds.includes("formation")) {
      const table = getFormationEventsTableClient();
      await ensureTableExists(table);

      let filter = baseFilter;

      if (cursorRk) {
        const escRk = escapeODataString(cursorRk);
        filter = `${filter} and RowKey lt '${escRk}'`;
      } else if (cursorT) {
        // back-compat best-effort (older cursor format)
        const escT = escapeODataString(cursorT);
        filter = `${filter} and occurredAt lt '${escT}'`;
      }

      formationFilterUsed = filter;

      const formationRows: any[] = [];
      for await (const row of table.listEntities<any>({ queryOptions: { filter } })) {
        formationRows.push(row);
        if (formationRows.length >= perTableMax) break;
      }
      formationFetched = formationRows.length;

      for (const row of formationRows) {
        items.push(mapFormationRow(row));
      }
    }

    // ---------- Engagement ----------
    let engagementFetched = 0;
    let engagementFilterUsed: string | null = null;

    if (kinds.includes("engagement")) {
      const table = getEngagementsTableClient();
      await ensureTableExists(table);

      let filter = baseFilter;

      if (cursorRk) {
        const escRk = escapeODataString(cursorRk);
        filter = `${filter} and RowKey lt '${escRk}'`;
      } else if (cursorT) {
        const escT = escapeODataString(cursorT);
        filter = `${filter} and occurredAt lt '${escT}'`;
      }

      engagementFilterUsed = filter;

      const engagementRows: any[] = [];
      for await (const row of table.listEntities<any>({ queryOptions: { filter } })) {
        engagementRows.push(row);
        if (engagementRows.length >= perTableMax) break;
      }
      engagementFetched = engagementRows.length;

      for (const row of engagementRows) {
        items.push(mapEngagementRow(row));
      }
    }

    // ---------- Merge / sort / limit ----------
    items.sort(sortTimelineDesc);

    const returned = items.slice(0, limit);

    // nextCursor uses the last returned item's rk
    let nextCursor: string | null = null;
    if (returned.length === limit) {
      const last = returned[returned.length - 1];
      if (last && last.rk) nextCursor = b64urlEncode({ rk: last.rk });
    }

    const response: any = {
      ok: true,
      visitorId,
      kinds,
      limit,
      cursor: cursorRaw ?? null,
      nextCursor,
      items: returned,
    };

    if (debugEnabled) {
      response.debug = {
        visitorId,
        kinds,
        limit,
        cursorRaw: cursorRaw ?? null,
        cursorDecoded,
        cursorRk,
        cursorT,
        perTableMax,
        counts: {
          formationFetched,
          engagementFetched,
          merged: items.length,
          returned: returned.length,
        },
        filters: {
          baseFilter,
          formation: formationFilterUsed,
          engagement: engagementFilterUsed,
        },
        tables: {
          formation: tableName(FORMATION_EVENTS_TABLE),
          engagement: tableName(ENGAGEMENTS_TABLE),
        },
      };
    }

    return { status: 200, jsonBody: response };
  },
});
