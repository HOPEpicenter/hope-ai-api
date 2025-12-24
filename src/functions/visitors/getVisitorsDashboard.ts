import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getVisitorsTableClient, VISITORS_PARTITION_KEY } from "../../storage/visitors/visitorsTable";
import { getFormationProfilesTableClient, getFormationEventsTableClient } from "../../storage/formation/formationTables";

function parsePositiveInt(val: string | null, fallback: number, max: number): number {
  if (!val) return fallback;
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const m = Math.floor(n);
  if (m <= 0) return fallback;
  return Math.min(m, max);
}

function escapeOdataString(s: string): string {
  return s.replace(/'/g, "''");
}

function getEngagementsTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING");
  return TableClient.fromConnectionString(conn, "Engagements");
}

const EXPLICIT_FOLLOWUP_EVENT_TYPES = new Set([
  "FOLLOWUP_ASSIGNED",
  "PRAYER_REQUESTED",
  "INFO_REQUESTED",
]);

app.http("getVisitorsDashboard", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/dashboard",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING" } };

    const limit = parsePositiveInt(req.query.get("limit"), 50, 500);
    const followupWindowHours = parsePositiveInt(req.query.get("followupWindowHours"), 168, 24 * 30); // default 7d
    const onlyWithFormation = String(req.query.get("onlyWithFormation") ?? "").toLowerCase() === "true";
    const cutoffMs = Date.now() - followupWindowHours * 60 * 60 * 1000;

    // Phase 2 window is fixed at 14 days (do NOT change behavior)
    const windowDays = 14;

    const visitorsTable = getVisitorsTableClient();
    const engagementsTable = getEngagementsTableClient();
    const profilesTable = getFormationProfilesTableClient(connectionString);
    const eventsTable = getFormationEventsTableClient(connectionString);

    await ensureTableExists(visitorsTable);
    await ensureTableExists(engagementsTable);
    await ensureTableExists(profilesTable as any);
    await ensureTableExists(eventsTable as any);

    const visitorFilter = `PartitionKey eq '${VISITORS_PARTITION_KEY}'`;

    const rows: any[] = [];
    let scannedVisitors = 0;

    for await (const v of visitorsTable.listEntities({ queryOptions: { filter: visitorFilter } })) {
      scannedVisitors++;
      if (rows.length >= limit) break;

      const visitorId = String((v as any)?.visitorId ?? "").trim();
      if (!visitorId) continue;

      const name = String((v as any)?.name ?? "");
      const email = String((v as any)?.email ?? "");
      const source = String((v as any)?.source ?? "unknown");
      const createdAt = (v as any)?.createdAt ?? null;

      // -------------------------
      // Phase 2: engagements (same logic style as getVisitorStatus)
      // -------------------------
      const engagementFilter = `PartitionKey eq '${escapeOdataString(visitorId)}'`;

      let lastEngagedAt: string | null = null;
      let engagementCount = 0;

      for await (const e of engagementsTable.listEntities({ queryOptions: { filter: engagementFilter } })) {
        engagementCount++;
        const occurredAt = (e as any)?.occurredAt;
        if (typeof occurredAt === "string") {
          if (!lastEngagedAt || occurredAt > lastEngagedAt) lastEngagedAt = occurredAt;
        }
      }

      let engaged = false;
      let daysSinceLastEngagement: number | null = null;

      if (lastEngagedAt) {
        const last = new Date(lastEngagedAt).getTime();
        const now = Date.now();
        const diffMs = now - last;
        daysSinceLastEngagement = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        engaged = diffMs <= windowDays * 24 * 60 * 60 * 1000;
      }

      // -------------------------
      // Phase 3: formation profile stage
      // -------------------------
      let formationStage = "Unknown";
      try {
        const p = await profilesTable.getEntity("VISITOR", visitorId);
        formationStage = String((p as any)?.stage ?? "").trim() || "Unknown";
      } catch {
        // profile may not exist yet
      }
      if (onlyWithFormation && formationStage === "Unknown") { continue; }

      // -------------------------
      // Phase 3: last formation event + followup flags
      // -------------------------
      const safeVid = escapeOdataString(visitorId);
      const eventsFilter = `(PartitionKey eq '${safeVid}' or visitorId eq '${safeVid}')`;

      let lastEventAt: string | null = null;
      let lastEventType: string | null = null;

      let lastOutcomeAt: string | null = null;
      const explicitSinceOutcome: string[] = [];

      for await (const ev of eventsTable.listEntities({ queryOptions: { filter: eventsFilter } })) {
        const occurredAt = String((ev as any)?.occurredAt ?? "");
        const t = String((ev as any)?.type ?? (ev as any)?.eventType ?? "");
        if (!occurredAt) continue;

        if (!lastEventAt || occurredAt > lastEventAt) {
          lastEventAt = occurredAt;
          lastEventType = t || null;
        }

        if (t === "FOLLOWUP_OUTCOME_RECORDED") {
          if (!lastOutcomeAt || occurredAt > lastOutcomeAt) {
            lastOutcomeAt = occurredAt;
          }
        }

        if (EXPLICIT_FOLLOWUP_EVENT_TYPES.has(t)) {
          explicitSinceOutcome.push(occurredAt);
        }
      }

      const explicitFollowup =
        explicitSinceOutcome.length > 0 &&
        (!lastOutcomeAt || explicitSinceOutcome.some(t => t > lastOutcomeAt));

      // followup priority mirrors queue logic:
      // - cleared if last event is FOLLOWUP_OUTCOME_RECORDED
      // - in queue if explicitFollowup OR stale
      let followupPriority: "high" | "medium" | "none" = "none";
      let followupReasonCode: string | null = null;

      if (lastEventType === "FOLLOWUP_OUTCOME_RECORDED") {
        followupPriority = "none";
        followupReasonCode = null;
      } else if (lastEventAt) {
        const lastMs = new Date(lastEventAt).getTime();
        const stale = Number.isFinite(lastMs) ? lastMs < cutoffMs : true;

        if (explicitFollowup) {
          followupPriority = "high";
          followupReasonCode = "EXPLICIT_FOLLOWUP";
        } else if (stale) {
          followupPriority = "medium";
          followupReasonCode = "NO_RECENT_ACTIVITY";
        }
      }

      rows.push({
        visitorId,
        name,
        email,
        source,
        createdAt,

        engagement: {
          engaged,
          lastEngagedAt,
          daysSinceLastEngagement,
          engagementCount,
          windowDays
        },

        formation: {
          stage: formationStage,
          lastEventAt,
          lastEventType
        },

        followup: {
          priority: followupPriority,
          reasonCode: followupReasonCode,
          windowHours: followupWindowHours
        }
      });
    }

    return {
      status: 200,
      jsonBody: {
        generatedAt: new Date().toISOString(),
        limit,
        scannedVisitors,
        count: rows.length,
        items: rows
      }
    };
  }
});


