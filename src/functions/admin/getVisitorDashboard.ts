// src/functions/admin/getVisitorDashboard.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { makeTableClient } from "../../shared/storage/makeTableClient";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { tableName } from "../../storage/tableName";

type TimelineKind = "formation" | "engagement";

type TimelineItem = {
  id: string;
  kind: TimelineKind;
  occurredAt: string;
  recordedAt: string;
  type: string;
  display: string;
  metadata?: any;
  data: any;      // normalized fields only
  dataRaw?: any;  // raw entity only when debug=1
};

type DashboardResponse = {
  ok: true;
  visitorId: string;
  visitor: {
    visitorId: string;
    name: string | null;
    email: string | null;
    source: string | null;
    createdAt: string | null;
  };
  engagementStatus: {
    engagementCount: number;
    lastEngagedAt: string | null;
    daysSinceLastEngagement: number | null;
    engaged: boolean;
  };
  formationSnapshot: {
    stage: string | null;
    assignedTo: string | null;
    lastFollowupAssignedAt: string | null;
    lastEventType: string | null;
    lastEventAt: string | null;
  };
  timelinePreview: {
    limit: number;
    kinds: TimelineKind[];
    cursor: string | null;
    cursorValid: boolean | null;
    count: number;
    hasMore: boolean;
    nextCursor: string | null;
    timelineItems: TimelineItem[];
  };
  debugStorage?: any;
};

function parsePositiveInt(val: string | null | undefined, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return i > 0 ? i : fallback;
}

function truthy01(val: string | null | undefined): boolean {
  if (!val) return false;
  const s = String(val).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function parseKinds(raw: string | null | undefined): Set<TimelineKind> {
  const s = (raw ?? "").trim();
  if (!s) return new Set<TimelineKind>(["formation", "engagement"]);

  const parts = s.split(",").map(p => p.trim().toLowerCase()).filter(Boolean);
  const kinds = new Set<TimelineKind>();
  for (const p of parts) {
    if (p === "formation") kinds.add("formation");
    if (p === "engagement") kinds.add("engagement");
  }
  return kinds.size ? kinds : new Set<TimelineKind>(["formation", "engagement"]);
}

function parseKindsFromQuery(q: any): Set<TimelineKind> {
  // Supports:
  //   ?kinds=formation&kinds=engagement
  //   ?kinds=formation,engagement
  const all: string[] = (typeof q?.getAll === "function") ? q.getAll("kinds") : [];
  const raw = (all && all.length > 0) ? all.join(",") : q?.get?.("kinds");
  return parseKinds(raw);
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
  try { return JSON.parse(s); } catch { return val; }
}

function isAzuriteConnectionString(cs: string): boolean {
  const s = cs.toLowerCase();
  return s.includes("devstoreaccount1") || s.includes("127.0.0.1") || s.includes("localhost");
}

function connFingerprint(cs: string) {
  const low = cs.toLowerCase();
  const accountName =
    /accountname=([^;]+)/i.exec(cs)?.[1] ??
    (low.includes("devstoreaccount1") ? "devstoreaccount1" : null);

  const tableEndpoint =
    /tableendpoint=([^;]+)/i.exec(cs)?.[1] ??
    (low.includes("127.0.0.1:10002") ? "http://127.0.0.1:10002/devstoreaccount1" : null);

  const blobEndpoint =
    /blobendpoint=([^;]+)/i.exec(cs)?.[1] ??
    (low.includes("127.0.0.1:10000") ? "http://127.0.0.1:10000/devstoreaccount1" : null);

  const queueEndpoint =
    /queueendpoint=([^;]+)/i.exec(cs)?.[1] ??
    (low.includes("127.0.0.1:10001") ? "http://127.0.0.1:10001/devstoreaccount1" : null);

  return {
    accountName,
    tableEndpoint,
    blobEndpoint,
    queueEndpoint,
    isAzurite: isAzuriteConnectionString(cs),
    hasUseDevStorage: low.includes("usedevelopmentstorage=true"),
    connLen: cs.length
  };
}

function getTableClientFromEnv(tbl: string): { client: TableClient; conn: string; isAzurite: boolean; fp: any } {
  const cs = process.env.STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  if (!cs) throw new Error("Storage connection string not set. Expected STORAGE_CONNECTION_STRING or AzureWebJobsStorage.");

  const isAzurite = isAzuriteConnectionString(cs);
  const client = makeTableClient(cs, tbl);
  return { client, conn: cs, isAzurite, fp: connFingerprint(cs) };
}

/**
 * Build listEntities options deterministically
 */
function listOpts(filter?: string) {
  return filter ? { queryOptions: { filter } } : undefined;
}

/**
 * Probe using the same async-iterator path as the working timeline endpoint
 */
async function probeFirstEntity(client: TableClient, filter?: string): Promise<any | null> {
  for await (const e of client.listEntities(listOpts(filter))) {
    return e as any;
  }
  return null;
}

function normalizeFormationEntity(visitorId: string, e: any, includeRaw: boolean): TimelineItem | null {
  const occurredAt =
    safeIso(e.occurredAt) ??
    safeIso((e as any).OccurredAt) ??
    safeIso(e.timestamp) ??
    safeIso(e.recordedAt);

  if (!occurredAt) return null;

  const recordedAt = safeIso(e.recordedAt) ?? occurredAt;
  const type = (e.type ?? (e as any).Type ?? "UNKNOWN").toString();
  const display = (e.display ?? (e as any).Display ?? `${type}`).toString();

  const metadata =
    parseMaybeJson(e.metadata) ??
    parseMaybeJson((e as any).Metadata) ??
    parseMaybeJson((e as any).metadataJson) ??
    undefined;

  const eventId = (e.eventId ?? (e as any).EventId ?? (e as any).rowKey ?? (e as any).RowKey ?? "").toString();
  const id = eventId || ((e as any).rowKey ?? (e as any).RowKey ?? "").toString() || `${occurredAt}__${type}`;

  const data = { eventId: id, visitorId, type, occurredAt, recordedAt, display, metadata };

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
  const occurredAt =
    safeIso(e.occurredAt) ??
    safeIso((e as any).OccurredAt) ??
    safeIso(e.timestamp) ??
    safeIso(e.recordedAt);

  if (!occurredAt) return null;

  const recordedAt = safeIso(e.recordedAt) ?? occurredAt;
  const type = (e.eventType ?? e.type ?? (e as any).Type ?? "ENGAGEMENT").toString();
  const display = (e.display ?? (e as any).Display ?? `${type}`).toString();

  const metadata = {
    eventType: e.eventType ?? undefined,
    channel: e.channel ?? undefined,
    source: e.source ?? undefined,
    recordedBy: e.recordedBy ?? undefined
  };

  const engagementId = ((e as any).engagementId ?? (e as any).EngagementId ?? (e as any).rowKey ?? (e as any).RowKey ?? "").toString();
  const id = engagementId || ((e as any).rowKey ?? (e as any).RowKey ?? "").toString() || `${occurredAt}__${type}`;

  const data = { engagementId: id, visitorId, type, occurredAt, recordedAt, display, metadata };

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

const VISITORS_TABLE = tableName(process.env.VISITORS_TABLE || "Visitors");
const FORMATION_EVENTS_TABLE = tableName(process.env.FORMATION_EVENTS_TABLE || "FormationEvents");
const ENGAGEMENTS_TABLE = tableName(process.env.ENGAGEMENTS_TABLE || "Engagements");
const FORMATION_PROFILES_TABLE = tableName(process.env.FORMATION_PROFILES_TABLE || "FormationProfiles");

async function tryGetVisitor(visitorId: string, visitors: TableClient): Promise<any | null> {
  const attempts: Array<[string, string]> = [
    ["VISITOR", visitorId],
    [visitorId, visitorId]
  ];

  for (const [pk, rk] of attempts) {
    try {
      const e: any = await visitors.getEntity(pk as any, rk as any);
      return e ?? null;
    } catch { /* ignore */ }
  }
  return null;
}

async function tryGetFormationProfile(visitorId: string, profiles: TableClient): Promise<any | null> {
  const attempts: Array<[string, string]> = [
    ["VISITOR", visitorId],
    [visitorId, "PROFILE"],
    [visitorId, visitorId]
  ];

  for (const [pk, rk] of attempts) {
    try {
      const e: any = await profiles.getEntity(pk as any, rk as any);
      return e ?? null;
    } catch { /* ignore */ }
  }
  return null;
}

app.http("getVisitorDashboard", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "ops/visitors/{visitorId}/dashboard",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const visitorId = (req.params as any)?.visitorId;
    if (!visitorId) return { status: 400, jsonBody: { ok: false, error: "visitorId is required in route." } };

    const debug = truthy01(req.query.get("debug"));
    const timelineLimit = parsePositiveInt(req.query.get("timelineLimit"), 5);
    const kinds = parseKindsFromQuery(req.query);

    const visitorsClient = getTableClientFromEnv(VISITORS_TABLE);
    const profilesClient = getTableClientFromEnv(FORMATION_PROFILES_TABLE);
    const formationClient = getTableClientFromEnv(FORMATION_EVENTS_TABLE);
    const engagementsClient = getTableClientFromEnv(ENGAGEMENTS_TABLE);

    await ensureTableExists(visitorsClient.client);
    await ensureTableExists(profilesClient.client);
    await ensureTableExists(formationClient.client);
    await ensureTableExists(engagementsClient.client);

    const visitorEntity = await tryGetVisitor(visitorId, visitorsClient.client);
    const visitor = {
      visitorId,
      name: (visitorEntity?.name ?? visitorEntity?.Name ?? null) as string | null,
      email: (visitorEntity?.email ?? visitorEntity?.Email ?? null) as string | null,
      source: (visitorEntity?.source ?? visitorEntity?.Source ?? null) as string | null,
      createdAt: (safeIso(visitorEntity?.createdAt) ?? safeIso(visitorEntity?.CreatedAt) ?? null) as string | null
    };

    const profile = await tryGetFormationProfile(visitorId, profilesClient.client);
    const formationSnapshot = {
      stage: (profile?.stage ?? profile?.Stage ?? null) as string | null,
      assignedTo: (profile?.assignedTo ?? profile?.assigneeId ?? profile?.AssigneeId ?? null) as string | null,
      lastFollowupAssignedAt: (safeIso(profile?.lastFollowupAssignedAt) ?? safeIso(profile?.LastFollowupAssignedAt) ?? null) as string | null,
      lastEventType: (profile?.lastEventType ?? profile?.LastEventType ?? null) as string | null,
      lastEventAt: (safeIso(profile?.lastEventAt) ?? safeIso(profile?.LastEventAt) ?? null) as string | null
    };

    // Timeline preview
    const timelineItems: TimelineItem[] = [];
    const pullCap = Math.min(Math.max(timelineLimit * 8, 50), 300);

    const formationFilter = `visitorId eq '${String(visitorId).replace(/'/g, "''")}'`;
    const engagementFilter = `visitorId eq '${String(visitorId).replace(/'/g, "''")}'`;

    let formationProbeAnyRow: any = null;
    let formationProbeFirstFiltered: any = null;
    let engagementProbeAnyRow: any = null;
    let engagementProbeFirstFiltered: any = null;

    if (debug && kinds.has("formation")) {
      try {
        const e = await probeFirstEntity(formationClient.client);
        if (e) formationProbeAnyRow = {
          PartitionKey: (e as any).partitionKey ?? (e as any).PartitionKey,
          RowKey: (e as any).rowKey ?? (e as any).RowKey
        };
      } catch (err: any) {
        formationProbeAnyRow = { error: "probe_any_failed", message: String(err?.message ?? err) };
      }

      try {
        const e = await probeFirstEntity(formationClient.client, formationFilter);
        if (e) formationProbeFirstFiltered = {
          PartitionKey: (e as any).partitionKey ?? (e as any).PartitionKey,
          RowKey: (e as any).rowKey ?? (e as any).RowKey,
          visitorId: (e as any).visitorId,
          type: (e as any).type,
          occurredAt: (e as any).occurredAt,
          recordedAt: (e as any).recordedAt
        };
      } catch (err: any) {
        formationProbeFirstFiltered = { error: "probe_filtered_failed", message: String(err?.message ?? err) };
      }
    }

    if (debug && kinds.has("engagement")) {
      try {
        const e = await probeFirstEntity(engagementsClient.client);
        if (e) engagementProbeAnyRow = {
          PartitionKey: (e as any).partitionKey ?? (e as any).PartitionKey,
          RowKey: (e as any).rowKey ?? (e as any).RowKey
        };
      } catch (err: any) {
        engagementProbeAnyRow = { error: "probe_any_failed", message: String(err?.message ?? err) };
      }

      try {
        const e = await probeFirstEntity(engagementsClient.client, engagementFilter);
        if (e) engagementProbeFirstFiltered = {
          PartitionKey: (e as any).partitionKey ?? (e as any).PartitionKey,
          RowKey: (e as any).rowKey ?? (e as any).RowKey
        };
      } catch (err: any) {
        engagementProbeFirstFiltered = { error: "probe_filtered_failed", message: String(err?.message ?? err) };
      }
    }

    if (kinds.has("formation")) {
      let pulled = 0;
      for await (const e of formationClient.client.listEntities(listOpts(formationFilter))) {
        const item = normalizeFormationEntity(visitorId, e, debug);
        if (item) timelineItems.push(item);
        pulled++;
        if (pulled >= pullCap) break;
      }
    }

    if (kinds.has("engagement")) {
      let pulled = 0;
      for await (const e of engagementsClient.client.listEntities(listOpts(engagementFilter))) {
        const item = normalizeEngagementEntity(visitorId, e, debug);
        if (item) timelineItems.push(item);
        pulled++;
        if (pulled >= pullCap) break;
      }
    }

    timelineItems.sort((a, b) => {
      const ao = Date.parse(a.occurredAt);
      const bo = Date.parse(b.occurredAt);
      if (bo !== ao) return bo - ao;
      if (b.id !== a.id) return b.id.localeCompare(a.id);
      return 0;
    });

    const preview = timelineItems.slice(0, timelineLimit);
    const hasMore = timelineItems.length > preview.length;
    const nextCursor = preview.length > 0 ? preview[preview.length - 1].id : null;

    const engagementRows = timelineItems.filter(t => t.kind === "engagement");
    const lastEngagedAt = engagementRows.length > 0 ? engagementRows[0].occurredAt : null;

    let daysSinceLastEngagement: number | null = null;
    if (lastEngagedAt) {
      const ms = Date.now() - Date.parse(lastEngagedAt);
      if (Number.isFinite(ms)) daysSinceLastEngagement = Math.floor(ms / (1000 * 60 * 60 * 24));
    }

    const engagementStatus = {
      engagementCount: engagementRows.length,
      lastEngagedAt,
      daysSinceLastEngagement,
      engaged: lastEngagedAt != null
    };

    const resp: DashboardResponse = {
      ok: true,
      visitorId,
      visitor,
      engagementStatus,
      formationSnapshot,
      timelinePreview: {
        limit: timelineLimit,
        kinds: Array.from(kinds.values()),
        cursor: null,
        cursorValid: true,
        count: preview.length,
        hasMore,
        nextCursor,
        timelineItems: preview
      }
    };

    if (debug) {
      resp.debugStorage = {
        conn: `${visitorsClient.conn.substring(0, 35)}...`,
        isAzurite: visitorsClient.isAzurite,
        tablesRaw: {
          VISITORS_TABLE: process.env.VISITORS_TABLE || "Visitors",
          FORMATION_EVENTS_TABLE: process.env.FORMATION_EVENTS_TABLE || "FormationEvents",
          ENGAGEMENTS_TABLE: process.env.ENGAGEMENTS_TABLE || "Engagements",
          FORMATION_PROFILES_TABLE: process.env.FORMATION_PROFILES_TABLE || "FormationProfiles"
        },
        tables: {
          visitors: VISITORS_TABLE,
          formation: FORMATION_EVENTS_TABLE,
          engagement: ENGAGEMENTS_TABLE,
          formationProfiles: FORMATION_PROFILES_TABLE
        },
        filters: {
          formation: formationFilter,
          engagement: engagementFilter
        },
        probes: {
          formationProbeAnyRow,
          formationProbeFirstFiltered,
          formationProbeFoundAtLeastOne: !!formationProbeFirstFiltered,
          engagementProbeAnyRow,
          engagementProbeFirstFiltered,
          engagementProbeFoundAtLeastOne: !!engagementProbeFirstFiltered
        },
        fp: {
          visitors: visitorsClient.fp,
          profiles: profilesClient.fp,
          formation: formationClient.fp,
          engagement: engagementsClient.fp
        }
      };
    }

    if (!debug) {
      for (const it of resp.timelinePreview.timelineItems as any[]) {
        if (it && typeof it === "object" && it.dataRaw !== undefined) delete it.dataRaw;
      }
    }

    return { status: 200, jsonBody: resp };
  }
});
