import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationEventsTableClient, getFormationProfilesTableClient } from "../../storage/formation/formationTables";

function parsePositiveInt(val: string | null, fallback: number): number {
  if (!val) return fallback;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function escapeOdataString(s: string): string {
  return s.replace(/'/g, "''");
}

const EXPLICIT_FOLLOWUP_EVENT_TYPES = new Set([
  "FOLLOWUP_ASSIGNED",
  "PRAYER_REQUESTED",
  "INFO_REQUESTED",
]);

function bucketAge(ms: number) {
  const h = ms / (1000 * 60 * 60);
  const d = h / 24;
  if (h < 24) return "0_24h";
  if (d < 3) return "1_3d";
  if (d < 7) return "3_7d";
  return "7plus";
}

app.http("getFormationFollowupMetrics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/followup/metrics",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING" } };

    const windowHours = parsePositiveInt(req.query.get("windowHours"), 168);
    const cutoffMs = Date.now() - windowHours * 60 * 60 * 1000;

    const profilesTable = getFormationProfilesTableClient(connectionString);
    const eventsTable = getFormationEventsTableClient(connectionString);

    await ensureTableExists(profilesTable as any);
    await ensureTableExists(eventsTable as any);

    const profileFilter = `PartitionKey eq 'VISITOR'`;

    const priority = { high: 0, medium: 0 };
    const aging = { "0_24h": 0, "1_3d": 0, "3_7d": 0, "7plus": 0 };
    const cleared = { byOutcome: 0 };
    let profilesScanned = 0;
    let considered = 0;

    for await (const p of profilesTable.listEntities({ queryOptions: { filter: profileFilter } })) {
      profilesScanned++;

      const visitorId = String((p as any)?.visitorId ?? (p as any)?.rowKey ?? (p as any)?.RowKey ?? "").trim();
      if (!visitorId) continue;

      let lastEvent: any | null = null;
      let explicitFollowup = false;

      const safeVid = escapeOdataString(visitorId);
      const eventsFilter = `(PartitionKey eq '${safeVid}' or visitorId eq '${safeVid}')`;

      for await (const evt of eventsTable.listEntities({ queryOptions: { filter: eventsFilter } })) {
        const occurredAt = String((evt as any)?.occurredAt ?? "");
        if (occurredAt) {
          if (!lastEvent || occurredAt > String((lastEvent as any)?.occurredAt ?? "")) lastEvent = evt;
        }

        const t = String((evt as any)?.type ?? (evt as any)?.eventType ?? "");
        if (EXPLICIT_FOLLOWUP_EVENT_TYPES.has(t)) explicitFollowup = true;
      }

      if (!lastEvent) continue;
      considered++;

      const lastType = String((lastEvent as any)?.type ?? (lastEvent as any)?.eventType ?? "");

      // cleared
      if (lastType === "FOLLOWUP_OUTCOME_RECORDED") {
        cleared.byOutcome++;
        continue;
      }

      const lastAtIso = String((lastEvent as any)?.occurredAt ?? "");
      const lastAtMs = new Date(lastAtIso).getTime();
      const stale = Number.isFinite(lastAtMs) ? lastAtMs < cutoffMs : true;

      // In queue if explicit follow-up OR stale
      if (!explicitFollowup && !stale) continue;

      // priority
      if (explicitFollowup) priority.high++;
      else priority.medium++;

      // aging bucket based on time since last event
      const ageMs = Number.isFinite(lastAtMs) ? (Date.now() - lastAtMs) : Number.POSITIVE_INFINITY;
      const b = bucketAge(ageMs) as keyof typeof aging;
      aging[b]++;
    }

    const estimatedQueueSize = priority.high + priority.medium;

    return {
      status: 200,
      jsonBody: {
        generatedAt: new Date().toISOString(),
        windowHours,
        profilesScanned,
        profilesWithAnyEventsConsidered: considered,
        priority,
        aging,
        cleared,
        estimatedQueueSize,
        notes: [
          "Pilot metrics endpoint. Uses per-visitor event queries (N+1). Optimize later if data grows."
        ]
      }
    };
  }
});
