import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { computeEngagementSummary } from "../../domain/engagement/computeEngagement";
import { tableName } from "../../storage/tableName";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { computeFromProfile } from "../../domain/formation/computeFromProfile";

type Urgency = "OVERDUE" | "DUE_SOON" | "WATCH";

const ENGAGEMENTS_TABLE = "Engagements";

function getEngagementsTableClient(connectionString: string): TableClient {
  return TableClient.fromConnectionString(connectionString, tableName(ENGAGEMENTS_TABLE));
}

function parsePositiveInt(val: string | null, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseNonNegativeInt(val: string | null, fallback: number): number {
  if (val == null || String(val).trim() === "") return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return fallback;
  return Math.floor(n);
}

function escapeOdataString(value: string): string {
  return value.replace(/'/g, "''");
}

function toDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function latestDate(...dates: Array<Date | null | undefined>): Date | null {
  const valid = dates.filter(Boolean) as Date[];
  if (!valid.length) return null;
  valid.sort((a, b) => b.getTime() - a.getTime());
  return valid[0];
}

const urgencyRank: Record<Urgency, number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  WATCH: 2
};

// You already have computeFromProfile in this file earlier in your project versions.
// If your repo currently defines it elsewhere, keep your existing implementation.
// For safety, we import nothing new and assume it exists below in this file.
// If this errors, we’ll restore your existing computeFromProfile block from git.
export async function getFormationFollowupQueue(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  
  try {
const auth = requireApiKey(req);
  if (auth) return auth;

  const windowDays = parsePositiveInt(req.query.get("windowDays"), 0);
  const windowHours = windowDays > 0
    ? windowDays * 24
    : parsePositiveInt(req.query.get("windowHours"), 168); // default 7 days

  const maxResults = parsePositiveInt(req.query.get("maxResults"), 50);

  // Phase 6 (Option A)
  const cooldownHours = parseNonNegativeInt(req.query.get("cooldownHours"), 24);

  const filterVisitorId = (() => {
    const v = req.query.get("visitorId");
    return (typeof v === "string" && v.trim().length > 0) ? v.trim() : null;
  })();

  const now = new Date();
  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  const conn = process.env.STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  if (!conn) {
    return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage)" } };
  }

  const profilesTable = getFormationProfilesTableClient(conn);
  const engagementsTable = getEngagementsTableClient(conn);

  await ensureTableExists(profilesTable as any);
  await ensureTableExists(engagementsTable as any);

  const items: any[] = [];

  for await (const p of profilesTable.listEntities<any>()) {
    const visitorId = String((p as any)?.visitorId ?? (p as any)?.RowKey ?? "").trim();
    if (!visitorId) continue;

    if (filterVisitorId && visitorId !== filterVisitorId) continue;

    const computed = computeFromProfile(p, now);
    if (computed?.lastActivityAt && computed.lastActivityAt < cutoff) continue;
    if (!computed?.urgency) continue;

    // Phase 5: Engagement intelligence (PartitionKey = visitorId)
    const engagementEvents: any[] = [];
    const engagementFilter = `PartitionKey eq '${escapeOdataString(visitorId)}'`;
    for await (const e of engagementsTable.listEntities<any>({ queryOptions: { filter: engagementFilter } })) {
      engagementEvents.push(e);
    }

    const engagementSummary = computeEngagementSummary({
      events: engagementEvents,
      windowDays: windowDays > 0 ? windowDays : Math.ceil(windowHours / 24),
      nowMs: now.getTime()
    });

    // If they are engaged recently, downgrade urgency (still show in queue unless suppressed by cooldown)
    if (engagementSummary?.engaged && computed?.urgency && computed.urgency !== "WATCH") {
      computed.urgency = "WATCH";
      computed.recommendedAction = "Light touch / confirm next step";
      computed.reason = (computed.reason ? computed.reason + " + engaged recently" : "engaged recently");
    }

    // Phase 6 (Option A): cooldown suppression based on engagement
    // - If cooldownHours > 0 and lastEngagedAt exists and hoursSinceEngaged < cooldownHours => suppress
    // - If cooldownHours === 0 => cooldown disabled (do not suppress)
    if (cooldownHours > 0) {
      const lastEngagedAtRaw = engagementSummary?.lastEngagedAt ?? null;
      if (typeof lastEngagedAtRaw === "string" && lastEngagedAtRaw.length > 0) {
        const lastMs = Date.parse(lastEngagedAtRaw);
        if (!Number.isNaN(lastMs)) {
          const hoursSinceEngaged = (now.getTime() - lastMs) / (1000 * 60 * 60);
          if (hoursSinceEngaged < cooldownHours) {
            continue;
          }
        }
      }
    }

    items.push({
      visitorId,
      stage: computed.stage,
      urgency: computed.urgency,
      assignedTo: computed.assignedTo,
      lastActivityAt: computed.lastActivityAt ? computed.lastActivityAt.toISOString() : null,
      daysSinceLastActivity: computed.daysSinceLastActivity,
      lastFollowupAssignedAt: computed.lastFollowupAssignedAt ? computed.lastFollowupAssignedAt.toISOString() : null,
      lastFollowupOutcomeAt: computed.lastFollowupOutcomeAt ? computed.lastFollowupOutcomeAt.toISOString() : null,

      engaged: engagementSummary.engaged,
      lastEngagedAt: engagementSummary.lastEngagedAt,
      daysSinceLastEngagement: engagementSummary.daysSinceLastEngagement,
      engagementCount: engagementSummary.engagementCount,
      engagementScore: engagementSummary.score,
      engagementScoreReasons: engagementSummary.scoreReasons,

      recommendedAction: computed.recommendedAction,
      reason: computed.reason
    });
  }

  items.sort((a, b) => {
    const ur = urgencyRank[a.urgency as Urgency] - urgencyRank[b.urgency as Urgency];
    if (ur !== 0) return ur;

    const score = (b.engagementScore ?? -1) - (a.engagementScore ?? -1);
    if (score !== 0) return score;

    return String(a.lastActivityAt ?? "").localeCompare(String(b.lastActivityAt ?? ""));
  });

  const trimmed = items.slice(0, maxResults);

  return {
    status: 200,
    jsonBody: {
      generatedAt: now.toISOString(),
      windowDays: windowDays > 0 ? windowDays : null,
      windowHours,
      maxResults,
      cooldownHours,
      count: trimmed.length,
      items: trimmed,
      itemsPreview: trimmed.slice(0, Math.min(10, trimmed.length))
    }
  };
  } catch (err: any) {
    context.error("getFormationFollowupQueue FAILED", err);
    return {
      status: 500,
      jsonBody: {
        error: "getFormationFollowupQueue failed",
        message: err?.message ?? String(err),
        name: err?.name,
        stack: err?.stack
      }
    };
  }
}
app.http("getFormationFollowupQueue", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/followup-queue",
  handler: getFormationFollowupQueue
});



