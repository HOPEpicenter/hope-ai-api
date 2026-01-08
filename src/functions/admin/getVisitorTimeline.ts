import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { tableName } from "../../storage/tableName";

type TimelineKind = "formation" | "engagement";

type TimelineItem = {
  kind: TimelineKind;
  occurredAt: string;
  recordedAt: string;
  type: string;
  display: string;
  metadata?: any;
  data: any;      // normalized event fields only
  dataRaw?: any;  // raw table entity only when debug=1
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

/**
 * Normalize FormationEvents entity => TimelineItem
 * (no nested data.data; raw only when debug=1)
 */
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

  // NOTE: Azurite + SDK often give rowKey (lowercase)
  const eventId = (e.eventId ?? e.EventId ?? e.RowKey ?? e.rowKey ?? "").toString();

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

/**
 * Normalize Engagements entity => TimelineItem
 * - type prefers eventType when present
 * - adds metadata (channel/source/recordedBy/eventType) to both top-level and data.metadata
 */
function normalizeEngagementEntity(visitorId: string, e: any, includeRaw: boolean): TimelineItem | null {
  const occurredAt = safeIso(e.occurredAt) ?? safeIso(e.OccurredAt) ?? safeIso(e.timestamp) ?? safeIso(e.recordedAt);
  if (!occurredAt) return null;

  const recordedAt = safeIso(e.recordedAt) ?? occurredAt;

  // ✅ Prefer eventType when present (dev_engaged etc.)
  const type = (e.type ?? e.Type ?? e.eventType ?? e.EventType ?? e.kind ?? "ENGAGEMENT").toString();
  const display = (e.display ?? e.Display ?? `${type}`).toString();

  // If a metadata JSON field exists, use it; otherwise build a useful metadata object from columns
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

    const timelineItems: TimelineItem[] = [];
    const pullCap = Math.min(Math.max(limit * 3, 100), 500);

    // Confirmed schema: visitorId property exists in both FormationEvents and Engagements
    const filter = `visitorId eq '${visitorId}'`;

    const debugStorage: any = debug ? {
      conn: maskConnString(getConnString().cs),
      isAzurite: getConnString().isAzurite,
      tables: { formation: FORMATION_EVENTS_TABLE, engagement: ENGAGEMENTS_TABLE },
      filter
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

    // newest-first
    timelineItems.sort((a, b) => {
      const ao = Date.parse(a.occurredAt);
      const bo = Date.parse(b.occurredAt);
      if (bo !== ao) return bo - ao;

      const ar = Date.parse(a.recordedAt);
      const br = Date.parse(b.recordedAt);
      return br - ar;
    });

    const sliced = timelineItems.slice(0, limit);

    // Contract enforcement:
    for (const it of sliced as any[]) {
      if (!it || typeof it !== "object") continue;

      // ensure no nested data.data
      if (it.data && typeof it.data === "object" && it.data.data !== undefined) {
        const { data: _nested, ...normalizedOnly } = it.data;
        it.data = normalizedOnly;
      }

      // raw only when debug=1
      if (!debug && it.dataRaw !== undefined) delete it.dataRaw;
    }

    return {
      status: 200,
      jsonBody: {
        ok: true,
        visitorId,
        limit,
        kinds: Array.from(kinds.values()),
        debug,
        count: sliced.length,
        timelineItems: sliced,
        ...(debug ? { debugStorage } : {})
      }
    };
  }
});
