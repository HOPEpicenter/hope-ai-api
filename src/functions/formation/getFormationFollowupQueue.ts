import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { computeEngagementSummary } from "../../domain/engagement/computeEngagement";
import { tableName } from "../../storage/tableName";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";

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


function escapeOdataString(value: string): string {
  return value.replace(/'/g, "''");
}

function toDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function hoursBetween(now: Date, then: Date): number {
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (60 * 60 * 1000));
}

function daysBetween(now: Date, then: Date): number {
  const ms = now.getTime() - then.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function maxDate(dates: Array<Date | null>): Date | null {
  const valid = dates.filter((d): d is Date => !!d);
  if (!valid.length) return null;
  valid.sort((a, b) => b.getTime() - a.getTime());
  return valid[0];
}

function computeFromProfile(p: any, now: Date) {
  const stage = String(p.stage ?? "Unknown");
  const assignedTo = p.assignedTo ?? null;

  const lastFollowupAssignedAt = toDate(p.lastFollowupAssignedAt);
  const lastFollowupContactedAt = toDate(p.lastFollowupContactedAt);
  const lastFollowupOutcomeAt = toDate(p.lastFollowupOutcomeAt);
  const stageUpdatedAt = toDate(p.stageUpdatedAt);

  const lastActivityAt = maxDate([
    lastFollowupOutcomeAt,
    lastFollowupContactedAt,
    lastFollowupAssignedAt,
    stageUpdatedAt
  ]);

  const stageReason = String(p.stageReason ?? ""); 
  const outcomeRecorded = stageReason === "event:FOLLOWUP_OUTCOME_RECORDED";
  const stageIsClosed = stage === "Connected";
  const openFollowup = !!lastFollowupAssignedAt && !lastFollowupOutcomeAt && !outcomeRecorded && !stageIsClosed;
  const daysSinceLastActivity = lastActivityAt ? daysBetween(now, lastActivityAt) : null;

  let urgency: Urgency | null = null;
  let recommendedAction: string | null = null;
  let reason: string | null = null;

  if (openFollowup && lastFollowupAssignedAt) {
    const hrs = hoursBetween(now, lastFollowupAssignedAt);

    if (hrs >= 72) {
      urgency = "OVERDUE";
      recommendedAction = "Contact today (overdue follow-up)";
      reason = "Follow-up assigned + no outcome recorded + 72h+";
    } else if (hrs >= 24) {
      urgency = "DUE_SOON";
      recommendedAction = "Contact within 48h";
      reason = "Follow-up assigned + no outcome recorded + 24–71h";
    } else {
      // assigned recently; still queue-able if you want, but we keep it out for signal clarity
      urgency = "DUE_SOON";
      recommendedAction = "Contact within 48h";
      reason = "Follow-up assigned + no outcome recorded";
    }
  } else {
    const earlyStage = ["Visitor", "Guest", "Unknown"].includes(stage);
    if (earlyStage && stageUpdatedAt) {
      const days = daysBetween(now, stageUpdatedAt);
      if (days >= 7) {
        urgency = "WATCH";
        recommendedAction = "Check-in / invite to next step";
        reason = "Early stage + 7+ days since stage update";
      }
    }
  }

  return {
    stage,
    assignedTo,
    lastFollowupAssignedAt,
    lastFollowupOutcomeAt,
    lastActivityAt,
    daysSinceLastActivity,
    urgency,
    recommendedAction,
    reason
  };
}

export async function getFormationFollowupQueue(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const windowDays = parsePositiveInt(req.query.get("windowDays"), 0);
  const windowHours = windowDays > 0
    ? windowDays * 24
    : parsePositiveInt(req.query.get("windowHours"), 168); // default 7 days
  const maxResults = parsePositiveInt(req.query.get("maxResults"), 50);

  const now = new Date();
  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  const conn = process.env.STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  if (!conn) {
    return { status: 500, jsonBody: { error: "Missing STORAGE_CONNECTION_STRING (or AzureWebJobsStorage)" } };
  }

  const profilesTable = getFormationProfilesTableClient(conn);
  await ensureTableExists(profilesTable as any);


  const engagementsTable = getEngagementsTableClient(conn);
  await ensureTableExists(engagementsTable as any);
  const items: any[] = [];

  for await (const p of profilesTable.listEntities<any>()) {
    const visitorId = String(p.visitorId ?? p.rowKey ?? p.RowKey ?? "");
    if (!visitorId) continue;

    const computed = computeFromProfile(p, now);


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
    // within window: use lastActivityAt if present; otherwise include (dev safe)
    if (computed.lastActivityAt && computed.lastActivityAt < cutoff) continue;

    if (!computed.urgency) continue;

    // If they are engaged recently, downgrade urgency (still show in queue)
    if (engagementSummary?.engaged && computed?.urgency && computed.urgency !== "WATCH") {
      computed.urgency = "WATCH";
      computed.recommendedAction = "Light touch / confirm next step";
      computed.reason = (computed.reason ? computed.reason + " + engaged recently" : "engaged recently");
    }

        // Cooldown: if engaged within last 24h, hide from queue
    const lastEngaged = engagementSummary?.lastEngagedAt
      ? new Date(engagementSummary.lastEngagedAt)
      : null;

    if (lastEngaged) {
      const hoursSinceEngaged = Math.floor(
        (now.getTime() - lastEngaged.getTime()) / (60 * 60 * 1000)
      );
      if (hoursSinceEngaged < 24) {
        continue;
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

  const urgencyRank: Record<Urgency, number> = { OVERDUE: 0, DUE_SOON: 1, WATCH: 2 };

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
      count: trimmed.length,
      items: trimmed,
      itemsPreview: trimmed.slice(0, Math.min(10, trimmed.length))
    }
  };
}

app.http("getFormationFollowupQueue", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "formation/followup-queue",
  handler: getFormationFollowupQueue
});














