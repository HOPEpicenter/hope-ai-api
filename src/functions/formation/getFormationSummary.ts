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

app.http("getFormationSummary", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/summary",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING" } };

    const windowHours = parsePositiveInt(req.query.get("windowHours"), 168); // 7 days default
    const cutoffMs = Date.now() - windowHours * 60 * 60 * 1000;

    const profilesTable = getFormationProfilesTableClient(connectionString);
    const eventsTable = getFormationEventsTableClient(connectionString);

    await ensureTableExists(profilesTable as any);
    await ensureTableExists(eventsTable as any);

    // ---- Profiles: stage counts ----
    const stageCounts: Record<string, number> = { Visitor: 0, Guest: 0, Connected: 0, Unknown: 0 };
    let profilesTotal = 0;

    // only VISITOR profiles
    const profileFilter = `PartitionKey eq 'VISITOR'`;

    // keep list of visitorIds for follow-up assessment
    const visitorIds: string[] = [];

    for await (const p of profilesTable.listEntities({ queryOptions: { filter: profileFilter } })) {
      profilesTotal++;
      const stage = String((p as any)?.stage ?? "").trim() || "Unknown";
      if (stageCounts[stage] == null) stageCounts[stage] = 0;
      stageCounts[stage]++;

      const vid = String((p as any)?.visitorId ?? (p as any)?.rowKey ?? (p as any)?.RowKey ?? "").trim();
      if (vid) visitorIds.push(vid);
    }

    // ---- Events: recent activity counts ----
    // We can’t efficiently filter by occurredAt across all partitions, so we do a scan.
    // Keep it simple for now (pilot scale).
    let eventsTotal = 0;
    let eventsLastWindow = 0;
    let eventsLast30d = 0;

    const cutoff30dMs = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for await (const e of eventsTable.listEntities()) {
      eventsTotal++;
      const occurredAt = String((e as any)?.occurredAt ?? "");
      if (!occurredAt) continue;
      const t = new Date(occurredAt).getTime();
      if (Number.isFinite(t)) {
        if (t >= cutoffMs) eventsLastWindow++;
        if (t >= cutoff30dMs) eventsLast30d++;
      }
    }

    // ---- Follow-up workload snapshot (reuse queue logic in aggregate) ----
    // For each visitor profile, find last event + any explicit followup signal.
    // Note: This is N+1 scans right now; acceptable at small scale. We can optimize later.
    let followupHigh = 0;
    let followupMedium = 0;
    let followupCleared = 0;

    for (const visitorId of visitorIds) {
      let lastEvent: any | null = null;
      let explicitFollowup = false;

      const safeVid = escapeOdataString(visitorId);
      const filter = `(PartitionKey eq '${safeVid}' or visitorId eq '${safeVid}')`;

      for await (const evt of eventsTable.listEntities({ queryOptions: { filter } })) {
        const occurredAt = String((evt as any)?.occurredAt ?? "");
        if (occurredAt) {
          if (!lastEvent || occurredAt > String((lastEvent as any)?.occurredAt ?? "")) lastEvent = evt;
        }
        const t = String((evt as any)?.type ?? (evt as any)?.eventType ?? "");
        if (EXPLICIT_FOLLOWUP_EVENT_TYPES.has(t)) explicitFollowup = true;
      }

      if (!lastEvent) continue;

      const lastType = String((lastEvent as any)?.type ?? (lastEvent as any)?.eventType ?? "");
      if (lastType === "FOLLOWUP_OUTCOME_RECORDED") {
        followupCleared++;
        continue;
      }

      const lastAt = new Date(String((lastEvent as any)?.occurredAt ?? "")).getTime();
      const stale = Number.isFinite(lastAt) ? lastAt < cutoffMs : true;

      if (explicitFollowup) followupHigh++;
      else if (stale) followupMedium++;
    }

    return {
      status: 200,
      jsonBody: {
        generatedAt: new Date().toISOString(),
        windowHours,
        totals: {
          profiles: profilesTotal,
          events: eventsTotal,
        },
        stages: stageCounts,
        activity: {
          eventsLastWindow: eventsLastWindow,
          eventsLast30d: eventsLast30d,
        },
        followup: {
          high: followupHigh,
          medium: followupMedium,
          clearedByOutcome: followupCleared,
          estimatedQueueSize: followupHigh + followupMedium,
        },
        notes: [
          "Pilot summary endpoint. Event scans are full-table and follow-up workload uses per-visitor queries.",
          "Optimize later with partitioning/index strategy once data grows."
        ]
      }
    };
  }
});
