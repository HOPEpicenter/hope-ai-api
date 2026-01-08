import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { tableName } from "../../storage/tableName";

type TimelineKind = "formation" | "engagement";

type TimelineItem = {
  id: string;                // stable id (eventId or engagementId)
  kind: TimelineKind;
  occurredAt: string;
  recordedAt: string;
  type: string;
  display: string;
  metadata?: any;
  data: any;      // normalized event fields only
  dataRaw?: any;  // raw table entity only when debug=1
};

type CursorPayload = {
  o: string;       // occurredAt ISO
  r: string;       // recordedAt ISO
  k: TimelineKind; // kind
  id: string;      // item id
};

function parsePositiveInt(val: string | null | undefined, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}

function truthy01(val: string | null | undefined): boolean {
  if (!val) return false;
  return val === "1" || val.toLowerCase() === "true" || val.toLowerCase() === "yes";
}

function parseKinds(raw: string | null | undefined): Set<TimelineKind> {
  const s = (raw ?? "").trim();
  if (!s) return new Set<TimelineKind>(["formation", "engagement"]);

  const parts = s
    .split(",")
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);

  const kinds = new Set<TimelineKind>();
  for (const p of parts) {
    if (p === "formation") kinds.add("formation");
    if (p === "engagement") kinds.add("engagement");
  }

  if (kinds.size === 0) return new Set<TimelineKind>(["formation", "engagement"]);
  return kinds;
}

function safeIso(val: any): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

function parseMaybeJson(val: any): any {
  if (val == null) return undefined;
  if (typeof val === "object") return val;
  if (typeof val !== "string") return val;
  const s = val.trim();
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return val;
  }
}

/**
 * IMPORTANT:
 * - If env vars provide table names, they are assumed to be FINAL (already prefixed).
 * - Otherwise we compute using tableName("BaseName") which applies dev prefix locally.
 */
function resolveTableName(envVal: string | undefined, baseName: string): string {
  return (envVal && envVal.trim()) ? envVal.trim() : tableName(baseName);
}

const FORMATION_EVENTS_TABLE = resolveTableName(process.env.FORMATION_EVENTS_TABLE, "FormationEvents");
const ENGAGEMENTS_TABLE = resolveTableName(process.env.ENGAGEMENTS_TABLE, "Engagements");

function getConnString(): { cs: string; isAzurite: boolean } {
  const cs = process.env.STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage || "";
  const isAzurite =
    cs.includes("UseDevelopmentStorage=true") ||
    cs.includes("devstoreaccount1") ||
    cs.includes("127.0.0.1") ||
    cs.includes("localhost");
  return { cs, isAzurite };
}

function maskConnString(cs: string): string {
  if (!cs) return "";
  const short = cs.length <= 60 ? cs : (cs.slice(0, 30) + "..." + cs.slice(-20));
  return short.replace(/AccountKey=([^;]+)/i, "AccountKey=***");
}

function getTableClient(tableNameStr: string): TableClient {
  const { cs, isAzurite } = getConnString();
  if (!cs) {
    throw new Error("Storage connection string not set. Expected STORAGE_CONNECTION_STRING or AzureWebJobsStorage.");
  }
  return TableClient.fromConnectionString(cs, tableNameStr, { allowInsecureConnection: isAzurite });
}

// ---------- Cursor helpers (opaque base64url JSON) ----------

function base64UrlEncodeUtf8(s: string): string {
  // Node supports Buffer in Azure Functions runtime
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeUtf8(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Buffer.from(b64, "base64").toString("utf8");
}

function encodeCursorFromItem(it: TimelineItem): string {
  const payload: CursorPayload = { o: it.occurredAt, r: it.recordedAt, k: it.kind, id: it.id };
  return base64UrlEncodeUtf8(JSON.stringify(payload));
}

function decodeCursor(raw: string | null | undefined): CursorPayload | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  try {
    const json = base64UrlDecodeUtf8(s);
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    if (typeof obj.o !== "string" || typeof obj.r !== "string" || typeof obj.k !== "string" || typeof obj.id !== "string") return null;
    if (obj.k !== "formation" && obj.k !== "engagement") return null;
    return { o: obj.o, r: obj.r, k: obj.k, id: obj.id };
  } catch {
    return null;
  }
}

// ---------- Stable ordering + cursor comparisons ----------
// Sort order (newest first):
// occurredAt desc, recordedAt desc, kind asc, id asc

function compareKindAsc(a: TimelineKind, b: TimelineKind): number {
  // stable lexical is fine: "engagement" > "formation" but consistent
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function compareIdAsc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * compareDesc(a,b):
 *  - returns -1 if a should come BEFORE b (a is newer)
 *  - returns  0 if equal
 *  - returns  1 if a should come AFTER b (a is older)
 */
function compareDesc(a: { occurredAt: string; recordedAt: string; kind: TimelineKind; id: string },
                     b: { occurredAt: string; recordedAt: string; kind: TimelineKind; id: string }): number {
  const ao = Date.parse(a.occurredAt);
  const bo = Date.parse(b.occurredAt);
  if (bo !== ao) return bo - ao > 0 ? 1 : -1; // but careful: bo-ao positive => b newer => a after => 1

  const ar = Date.parse(a.recordedAt);
  const br = Date.parse(b.recordedAt);
  if (br !== ar) return br - ar > 0 ? 1 : -1;

  const kc = compareKindAsc(a.kind, b.kind);
  if (kc !== 0) return kc;

  return compareIdAsc(a.id, b.id);
}

function makeCursorComparable(c: CursorPayload): { occurredAt: string; recordedAt: string; kind: TimelineKind; id: string } {
  return { occurredAt: c.o, recordedAt: c.r, kind: c.k, id: c.id };
}

/**
 * Keep only items strictly AFTER the cursor in the DESC-sorted list (i.e., older than cursor)
 */
function isAfterCursor(item: TimelineItem, cursor: CursorPayload): boolean {
  const c = makeCursorComparable(cursor);
  // item older than cursor => compareDesc(item, cursor) === 1
  return compareDesc(item, c) === 1;
}

// ---------- Normalizers ----------

function normalizeFormationEntity(visitorId: string, e: any, includeRaw: boolean): TimelineItem | null {
  const occurredAt = safeIso(e.occurredAt) ?? safeIso(e.OccurredAt) ?? safeIso(e.timestamp) ?? safeIso(e.recordedAt);
  if (!occurredAt) return null;

  const recordedAt = safeIso(e.recordedAt) ?? occurredAt;

  const type = (e.type ?? e.Type ?? "UNKNOWN").toString();
  const display = (e.display ?? e.Display ?? `${type}`).toString();

  const metadata =
    parseMaybeJson(e.metadata) ??
    parseMaybeJson(e.Metadata) ??
    parseMaybeJson(e.metadataJson) ??
    undefined;

  const eventId = (e.eventId ?? e.EventId ?? e.RowKey ?? e.rowKey ?? "").toString();
  const id = eventId || `${visitorId}|${occurredAt}|${recordedAt}|formation`;

  const data = {
    eventId,
    visitorId,
    type,
    occurredAt,
    recordedAt,
    display,
    metadata
  };

  const item: TimelineItem = {
    id,
    kind: "formation",
    occurredAt,
    recordedAt,
    type,
    display,
    metadata,
    data
  };

  if (includeRaw) item.dataRaw = e;
  return item;
}

function normalizeEngagementEntity(visitorId: string, e: any, includeRaw: boolean): TimelineItem | null {
  const occurredAt = safeIso(e.occurredAt) ?? safeIso(e.OccurredAt) ?? safeIso(e.timestamp) ?? safeIso(e.recordedAt);
  if (!occurredAt) return null;

  const recordedAt = safeIso(e.recordedAt) ?? occurredAt;

  const type = (e.type ?? e.Type ?? e.eventType ?? e.EventType ?? e.kind ?? "ENGAGEMENT").toString();
  const display = (e.display ?? e.Display ?? `${type}`).toString();

  const metadata =
    parseMaybeJson(e.metadata) ??
    parseMaybeJson(e.Metadata) ??
    parseMaybeJson(e.metadataJson) ??
    {
      eventType: (e.eventType ?? e.EventType ?? type)?.toString(),
      channel: (e.channel ?? e.Channel)?.toString(),
      source: (e.source ?? e.Source)?.toString(),
      recordedBy: (e.recordedBy ?? e.RecordedBy)?.toString()
    };

  const engagementId = (e.engagementId ?? e.EngagementId ?? e.RowKey ?? e.rowKey ?? "").toString();
  const id = engagementId || `${visitorId}|${occurredAt}|${recordedAt}|engagement`;

  const data = {
    engagementId,
    visitorId,
    type,
    occurredAt,
    recordedAt,
    display,
    metadata
  };

  const item: TimelineItem = {
    id,
    kind: "engagement",
    occurredAt,
    recordedAt,
    type,
    display,
    metadata,
    data
  };

  if (includeRaw) item.dataRaw = e;
  return item;
}

app.http("getVisitorTimeline", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ops/visitors/{visitorId}/timeline",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const visitorId = (req.params as any)?.visitorId;
    if (!visitorId) {
      return { status: 400, jsonBody: { ok: false, error: "visitorId is required in route." } };
    }

    const limit = parsePositiveInt(req.query.get("limit"), 50);
    const kinds = parseKinds(req.query.get("kinds"));
    const debug = truthy01(req.query.get("debug"));
    const cursor = decodeCursor(req.query.get("cursor"));

    const timelineItems: TimelineItem[] = [];
    const pullCap = Math.min(Math.max(limit * 3, 100), 500);

    // Your confirmed schema: visitorId property exists in both tables
    const filter = `visitorId eq '${visitorId}'`;

    const debugStorage: any = debug ? {
      conn: maskConnString(getConnString().cs),
      isAzurite: getConnString().isAzurite,
      tables: { formation: FORMATION_EVENTS_TABLE, engagement: ENGAGEMENTS_TABLE },
      filter,
      cursorValid: cursor ? true : false
    } : undefined;

    if (kinds.has("formation")) {
      const formationTable = getTableClient(FORMATION_EVENTS_TABLE);
      await ensureTableExists(formationTable);

      if (debug) {
        let probeCount = 0;
        for await (const e of formationTable.listEntities({
          queryOptions: { filter, select: ["visitorId", "type", "occurredAt", "recordedAt", "rowKey", "partitionKey", "RowKey", "PartitionKey"] }
        })) {
          debugStorage.formationProbeFirst = {
            visitorId: (e as any).visitorId,
            type: (e as any).type,
            occurredAt: (e as any).occurredAt,
            recordedAt: (e as any).recordedAt,
            partitionKey: (e as any).partitionKey ?? (e as any).PartitionKey,
            rowKey: (e as any).rowKey ?? (e as any).RowKey
          };
          probeCount++;
          break;
        }
        debugStorage.formationProbeFoundAtLeastOne = probeCount > 0;
      }

      let pulled = 0;
      for await (const e of formationTable.listEntities({ queryOptions: { filter } })) {
        const item = normalizeFormationEntity(visitorId, e, debug);
        if (item) timelineItems.push(item);
        if (++pulled >= pullCap) break;
      }
    }

    if (kinds.has("engagement")) {
      const engagementsTable = getTableClient(ENGAGEMENTS_TABLE);
      await ensureTableExists(engagementsTable);

      if (debug) {
        let probeCount = 0;
        for await (const e of engagementsTable.listEntities({
          queryOptions: { filter, select: ["visitorId", "type", "eventType", "occurredAt", "recordedAt", "rowKey", "partitionKey", "RowKey", "PartitionKey"] }
        })) {
          debugStorage.engagementProbeFirst = {
            visitorId: (e as any).visitorId,
            type: (e as any).type ?? (e as any).eventType,
            occurredAt: (e as any).occurredAt,
            recordedAt: (e as any).recordedAt,
            partitionKey: (e as any).partitionKey ?? (e as any).PartitionKey,
            rowKey: (e as any).rowKey ?? (e as any).RowKey
          };
          probeCount++;
          break;
        }
        debugStorage.engagementProbeFoundAtLeastOne = probeCount > 0;
      }

      let pulled = 0;
      for await (const e of engagementsTable.listEntities({ queryOptions: { filter } })) {
        const item = normalizeEngagementEntity(visitorId, e, debug);
        if (item) timelineItems.push(item);
        if (++pulled >= pullCap) break;
      }
    }

    // Sort newest-first: occurredAt desc, recordedAt desc, kind asc, id asc
    timelineItems.sort((a, b) => compareDesc(a, b));

    // Apply cursor filter (return items after cursor, i.e. older than cursor)
    const filtered = cursor ? timelineItems.filter(it => isAfterCursor(it, cursor)) : timelineItems;

    // Page slice (+1 to detect hasMore)
    const pagePlusOne = filtered.slice(0, limit + 1);
    const hasMore = pagePlusOne.length > limit;
    const page = hasMore ? pagePlusOne.slice(0, limit) : pagePlusOne;

    // nextCursor = cursor of the last item in the returned page
    const nextCursor = (hasMore && page.length > 0) ? encodeCursorFromItem(page[page.length - 1]) : null;

    // Contract enforcement on output items
    for (const it of page as any[]) {
      if (!it || typeof it !== "object") continue;

      // no nested data.data
      if (it.data && typeof it.data === "object" && it.data.data !== undefined) {
        const { data: _nested, ...normalizedOnly } = it.data;
        it.data = normalizedOnly;
      }

      // raw only when debug=1
      if (!debug && it.dataRaw !== undefined) delete it.dataRaw;
    }

    const body: any = {
      ok: true,
      visitorId,
      limit,
      kinds: Array.from(kinds.values()),
      debug,
      cursor: req.query.get("cursor") ?? null,
      cursorValid: cursor ? true : (req.query.get("cursor") ? false : null),
      count: page.length,
      hasMore,
      nextCursor,
      timelineItems: page
    };

    if (debug) body.debugStorage = debugStorage;

    return { status: 200, jsonBody: body };
  }
});
