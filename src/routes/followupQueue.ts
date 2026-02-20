import express from "express";
import { ensureTableExists } from "../shared/storage/ensureTableExists";
import {
  getFormationProfilesTableClient,
  FORMATION_PROFILES_TABLE,
  FORMATION_PARTITION_KEY,
} from "../storage/formation/formationTables";

function toInt(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}


function toDateMs(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

function firstDefined<T>(...vals: any[]): T | null {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v as T;
  }
  return null;
}

function safeConnectionInfo(cs: string) {
  const out: any = {
    isDevelopment: false,
    hasUseDevelopmentStorage: false,
    accountName: null as string | null,
    hasAccountKey: false,
    hasSas: false,
    tableEndpoint: null as string | null,
  };

  const s = cs || "";
  out.hasUseDevelopmentStorage = /UseDevelopmentStorage=true/i.test(s);
  out.isDevelopment =
    out.hasUseDevelopmentStorage ||
    /devstoreaccount1/i.test(s) ||
    /127\.0\.0\.1/i.test(s) ||
    /localhost/i.test(s);

  const parts = s.split(";").map(p => p.trim()).filter(Boolean);
  const kv: Record<string, string> = {};
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    kv[k] = v;
  }

  out.accountName = kv["AccountName"] || null;
  out.tableEndpoint = kv["TableEndpoint"] || null;
  out.hasAccountKey = !!kv["AccountKey"];
  out.hasSas = !!kv["SharedAccessSignature"];

  return out;
}

function summarizeEntity(e: any) {
  const pk = e?.partitionKey ?? e?.PartitionKey ?? null;
  const rk = e?.rowKey ?? e?.RowKey ?? null;

  return {
    keys: {
      partitionKey: pk,
      rowKey: rk,
    },
    visitorId: e?.visitorId ?? rk ?? null,
    assignedTo: e?.assignedTo ?? e?.AssignedTo ?? null,
    lastFollowupAssignedAt: e?.lastFollowupAssignedAt ?? e?.LastFollowupAssignedAt ?? null,
  };
}

function tokenDebugInfo(token: any) {
  let preview: string | null = null;
  try {
    if (token === null || token === undefined) preview = null;
    else if (typeof token === "string") preview = token.slice(0, 300);
    else preview = JSON.stringify(token).slice(0, 300);
  } catch {
    preview = "[unstringifiable]";
  }



  return {
    typeof: typeof token,
    isArray: Array.isArray(token),
    isNull: token === null,
    isUndefined: token === undefined,
    preview,
  };
}


/** Cursor helpers (API cursor is base64(JSON) where possible) */
function encodeCursor(token: any): string | null {
  if (token === null || token === undefined) return null;
  if (typeof token === "string") return token;
  try {
    return Buffer.from(JSON.stringify(token), "utf8").toString("base64");
  } catch {
    return null;
  }
}

function decodeCursor(raw: any): any {
  if (raw === null || raw === undefined || raw === "") return undefined;

  // If the caller sent an object token, preserve it.
  if (typeof raw === "object") return raw;

  // IMPORTANT: In this SDK/runtime, continuationToken is an opaque STRING (even if it looks like base64 JSON).
  // Treat string cursors as opaque and pass through unchanged.
  if (typeof raw === "string") return raw;

  return undefined;
}


function pageRows(page: any): any[] {
  // Robust: SDK versions differ. Support:
  // - page.values (common)
  // - page.entities (some code samples)
  // - page.items (some pagers)
  // - page itself is array (some iterators)
  if (!page) return [];
  if (Array.isArray(page)) return page;

  const vals = page?.values ?? page?.entities ?? page?.items ?? [];
  return Array.isArray(vals) ? vals : [];
}

function getKeys(e: any): { partitionKey: string | null; rowKey: string | null; visitorId: string | null } {
  const partitionKey = (e?.partitionKey ?? e?.PartitionKey ?? null) as string | null;
  const rowKey = (e?.rowKey ?? e?.RowKey ?? null) as string | null;
  const visitorId = (e?.visitorId ?? rowKey ?? null) as string | null;
  return { partitionKey, rowKey, visitorId };
}

// IMPORTANT: keep named export because src/index.ts imports { followupQueueRouter }
export const followupQueueRouter = express.Router();

/**
 * Definitive debug endpoint:
 * GET /api/debug/tables/formation-profiles2?limit=5
 *
 * Uses direct entity iteration (NOT byPage), so we cannot get "0" due to page-shape mismatch.
 */
followupQueueRouter.get("/debug/tables/formation-profiles2", async (req, res, next) => {
  try {
    const limit = Math.min(toInt(req.query.limit, 5), 25);

    const cs =
      process.env.STORAGE_CONNECTION_STRING ||
      process.env.AzureWebJobsStorage ||
      "";

    const table = getFormationProfilesTableClient();
    await ensureTableExists(table);

    const rows: any[] = [];
    for await (const e of table.listEntities()) {
      rows.push(e);
      if (rows.length >= limit) break;
    }

    const firstRow = rows[0];
    const keysPreviewFirstRow =
      firstRow && typeof firstRow === "object" ? Object.keys(firstRow).slice(0, 25) : [];

    res.json({
      ok: true,
      tableName: FORMATION_PROFILES_TABLE,
      tableUrl: (table as any).url ?? null,
      storage: {
        safe: safeConnectionInfo(cs),
        rawLength: cs.length, // safe-ish; no secrets
      },
      got: rows.length,
      sample: rows.map(summarizeEntity),
      keysPreviewFirstRow,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Followup queue v2:
 * GET /api/formation/followup-queue2?limit=10[&debug=1]
 */
function needsFollowup(e: any): boolean {
  // "Assigned followup queue" semantics:
  // - must be assigned
  // - must have lastFollowupAssignedAt
  // - exclude if an outcome was recorded after assignment
  // - exclude if nextFollowupAt is in the future (scheduled later)

  const assignedTo = firstDefined<string>(
    e?.assignedTo,
    e?.AssignedTo,
    e?.followupAssignedTo,
    e?.FollowupAssignedTo
  );

  if (!assignedTo) return false;

  const assignedAtMs = toDateMs(
    firstDefined<any>(
      e?.lastFollowupAssignedAt,
      e?.LastFollowupAssignedAt,
      e?.followupAssignedAt,
      e?.FollowupAssignedAt
    )
  );

  if (!assignedAtMs) return false;

  // Optional scheduling: if there's a "next followup" time and it's in the future, don't surface yet.
  const nextFollowupAtMs = toDateMs(
    firstDefined<any>(
      e?.nextFollowupAt,
      e?.NextFollowupAt,
      e?.lastNextStepAt,
      e?.LastNextStepAt
    )
  );

  if (nextFollowupAtMs && nextFollowupAtMs > Date.now()) return false;

  // Outcome timestamps: if any outcome is recorded after assignment, treat as already followed up.
  const outcomeAtMs = toDateMs(
    firstDefined<any>(
      e?.lastOutcomeAt,
      e?.LastOutcomeAt,
      e?.followupOutcomeAt,
      e?.FollowupOutcomeAt,
      e?.lastFollowupOutcomeAt,
      e?.LastFollowupOutcomeAt
    )
  );

  if (outcomeAtMs && outcomeAtMs >= assignedAtMs) return false;

  return true;
}

followupQueueRouter.get("/formation/followup-queue2", async (req, res, next) => {
  try {
    const limit = Math.min(toInt(req.query.limit, 10), 200);
    const debug = String(req.query.debug || "") === "1";

    const table = getFormationProfilesTableClient();
    await ensureTableExists(table);

    const filter = `PartitionKey eq '${FORMATION_PARTITION_KEY}'`;

    let scannedPages = 0;
    let rawGot = 0;

    const sampleRaw: any[] = [];
    const sampleFiltered: any[] = [];

    const items: any[] = [];
    let continuationToken: any = decodeCursor(req.query.cursor);

    // TEMP debug: what did we receive / decode?
    const receivedCursorRaw: any = req.query.cursor;
    const receivedCursorStr: string =
      receivedCursorRaw === null || receivedCursorRaw === undefined
        ? ""
        : typeof receivedCursorRaw === "string"
          ? receivedCursorRaw
          : JSON.stringify(receivedCursorRaw);

    const decodedCursorType = typeof continuationToken;
    const decodedCursorPreview = tokenDebugInfo(continuationToken);

    let byPageOutputToken: any = null;

    while (items.length < limit) {
      const pageIter = table
        .listEntities({ queryOptions: { filter } })
        .byPage({ maxPageSize: Math.min(200, limit), continuationToken });

      const nxt = await pageIter.next();
      if (nxt.done) break;

      scannedPages += 1;

      const page = nxt.value as any;
      const entities: any[] = pageRows(page);

      continuationToken = (page as any)?.continuationToken ?? (nxt.value as any)?.continuationToken;
      byPageOutputToken = tokenDebugInfo(continuationToken);

      rawGot += entities.length;

      for (const e of entities) {
        if (sampleRaw.length < 3) sampleRaw.push(summarizeEntity(e));

        if (needsFollowup(e)) {
          if (sampleFiltered.length < 3) sampleFiltered.push(summarizeEntity(e));
          items.push({
            visitorId: getKeys(e).visitorId ?? getKeys(e).rowKey ?? null,
            assignedTo: e?.assignedTo ?? e?.AssignedTo ?? null,
            lastFollowupAssignedAt: e?.lastFollowupAssignedAt ?? e?.LastFollowupAssignedAt ?? null,
          });
          if (items.length >= limit) break;
        }
      }

      if (!continuationToken) break;
      if (scannedPages >= 50) break;
    }

    if (debug) {
      res.json({
        ok: true,
        items,
        cursor: encodeCursor(continuationToken),
        meta: {
          receivedCursor: receivedCursorStr.slice(0, 80),
          decodedCursorType,
          decodedCursorPreview,
          byPageOutputToken,
          scannedPages,
          rawGot,
          filteredGot: items.length,
          sampleRaw,
          sampleFiltered,
          continuationToken: tokenDebugInfo(continuationToken),
        },
      });
      return;
    }

    res.json({
      ok: true,
      items,
      cursor: encodeCursor(continuationToken),
    });
  } catch (err) {
    next(err);
  }
});

export default followupQueueRouter;




