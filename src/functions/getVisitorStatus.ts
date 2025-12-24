import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../shared/auth/requireApiKey";
import { ensureTableExists } from "../shared/storage/ensureTableExists";
import { getFormationProfilesTableClient, getFormationEventsTableClient } from "../storage/formation/formationTables";

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { error: message } };
}

function escapeOdataString(s: string): string {
  return s.replace(/'/g, "''");
}

function getEngagementsTableClient(): TableClient {
  const conn = process.env.STORAGE_CONNECTION_STRING;
  if (!conn) throw new Error("Missing STORAGE_CONNECTION_STRING");
  return TableClient.fromConnectionString(conn, "Engagements");
}

app.http("getVisitorStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "visitors/status",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING" } };

    const visitorId = (req.query.get("visitorId") ?? "").trim();
    if (!visitorId) return badRequest("Query parameter 'visitorId' is required.");

    // -------------------------
    // Phase 2: engagement status (DO NOT CHANGE)
    // -------------------------
    const engagementsTable = getEngagementsTableClient();
    await ensureTableExists(engagementsTable);

    const engagementFilter = `PartitionKey eq '${escapeOdataString(visitorId)}'`;

    let lastEngagedAt: string | null = null;
    let engagementCount = 0;

    for await (const e of engagementsTable.listEntities({ queryOptions: { filter: engagementFilter } })) {
      engagementCount++;
      const occurredAt = (e as any).occurredAt;
      if (typeof occurredAt === "string") {
        if (!lastEngagedAt || occurredAt > lastEngagedAt) lastEngagedAt = occurredAt;
      }
    }

    const windowDays = 14;
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
    // Phase 3: formation status (minimal + surgical)
    // -------------------------
    const profilesTable = getFormationProfilesTableClient(connectionString);
    await ensureTableExists(profilesTable as any);

    // FormationProfiles stored as: PartitionKey="VISITOR", RowKey=visitorId
    const profileFilter = `PartitionKey eq 'VISITOR' and RowKey eq '${escapeOdataString(visitorId)}'`;

    let profile: any | null = null;
    for await (const p of profilesTable.listEntities({ queryOptions: { filter: profileFilter } })) {
      profile = p as any;
      break;
    }

    // ✅ Single source of truth: ALWAYS from FormationProfiles.stage
    const formationStage = String((profile as any)?.stage ?? "").trim() || "Unknown";

    const eventsTable = getFormationEventsTableClient(connectionString);
    await ensureTableExists(eventsTable as any);

    // Events lookup: works whether PartitionKey is visitorId OR visitorId is just a property
    const safeVid = escapeOdataString(visitorId);
    const eventsFilter = `(PartitionKey eq '${safeVid}' or visitorId eq '${safeVid}')`;

    let lastEventAt: string | null = null;
    let lastEventType: string | null = null;

    for await (const ev of eventsTable.listEntities({ queryOptions: { filter: eventsFilter } })) {
      const occurredAt = String((ev as any)?.occurredAt ?? "");
      const type = String((ev as any)?.type ?? (ev as any)?.eventType ?? "");
      if (!occurredAt) continue;

      if (!lastEventAt || occurredAt > lastEventAt) {
        lastEventAt = occurredAt;
        lastEventType = type || null;
      }
    }

    return {
      status: 200,
      jsonBody: {
        visitorId,

        // Phase 2
        engaged,
        lastEngagedAt,
        daysSinceLastEngagement,
        engagementCount,
        windowDays,

        // Phase 3
        formation: {
          stage: formationStage,
          lastEventAt,
          lastEventType
        }
      }
    };
  }
});
