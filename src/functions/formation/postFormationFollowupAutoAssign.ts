import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { writeAutomationRun } from "../../storage/formation/automationRunsRepo";
import { computeEngagementSummary } from "../../domain/engagement/computeEngagement";
import { tableName } from "../../storage/tableName";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { computeFromProfile } from "../../domain/formation/computeFromProfile";
import { validateFormationEvent, FormationEventType } from "../../domain/formation/phase3_1_scope";
import { recordFormationEvent } from "../../domain/formation/recordFormationEvent";

type Urgency = "OVERDUE" | "DUE_SOON" | "WATCH";

const ENGAGEMENTS_TABLE = "Engagements";

function getEngagementsTableClient(connectionString: string): TableClient {
  return TableClient.fromConnectionString(connectionString, tableName(ENGAGEMENTS_TABLE));
}

function parsePositiveInt(val: any, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseNonNegativeInt(val: any, fallback: number): number {
  if (val == null || String(val).trim() === "") return fallback;
  const n = Number(val);
  if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return fallback;
  return Math.floor(n);
}

function escapeOdataString(value: string): string {
  return value.replace(/'/g, "''");
}

const urgencyRank: Record<Urgency, number> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  WATCH: 2
};

type AutoAssignBody = {
  assigneeId?: string;
  maxResults?: number;
  dryRun?: boolean;
    force?: boolean;
cooldownHours?: number;
  windowHours?: number;
  windowDays?: number;
  channel?: string;
  notes?: string;
  visitorId?: string; // optional: allow targeting one visitor for testing
};

function badRequest(message: string): HttpResponseInit {
  return { status: 400, jsonBody: { ok: false, error: message } };
}

app.http("autoAssignFollowup", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "formation/followup/auto-assign",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const auth = requireApiKey(req);
    if (auth) return auth;

    // AUTO_ASSIGN_RUN_START_TS
    const __runStartedAtMs = Date.now();
    const __runStartedAt = new Date(__runStartedAtMs).toISOString();

    const connectionString = process.env.STORAGE_CONNECTION_STRING;
    if (!connectionString) throw new Error("Missing STORAGE_CONNECTION_STRING");

    let body: AutoAssignBody = {};
    try {
      body = (await req.json()) ?? {};
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const now = new Date();

    const assigneeId =
      typeof body.assigneeId === "string" && body.assigneeId.trim().length > 0
        ? body.assigneeId.trim()
        : "unassigned";

    const maxResults = parsePositiveInt(body.maxResults, 25);
    const dryRun = typeof body.dryRun === "boolean" ? body.dryRun : true;

    
    const force = typeof body.force === "boolean" ? body.force : false;
const cooldownHours = parseNonNegativeInt(body.cooldownHours, 24);
    const windowHours = parsePositiveInt(body.windowHours, 168);

    const windowDays =
      typeof body.windowDays === "number" && body.windowDays > 0
        ? Math.floor(body.windowDays)
        : 14;

    const channel =
      typeof body.channel === "string" && body.channel.trim().length > 0 ? body.channel.trim() : "auto";

    const baseNotes = typeof body.notes === "string" ? body.notes : "";

    const filterVisitorId =
      typeof body.visitorId === "string" && body.visitorId.trim().length > 0 ? body.visitorId.trim() : null;

    const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

    const profilesTable = getFormationProfilesTableClient(connectionString);
    await ensureTableExists(profilesTable);

    const engagementsTable = getEngagementsTableClient(connectionString);
    await ensureTableExists(engagementsTable);

    const items: any[] = [];
    let scannedProfiles = 0;

    // Build a queue-equivalent list using the SAME gating logic as getFormationFollowupQueue
    for await (const p of profilesTable.listEntities<any>()) {
      scannedProfiles++;

      const visitorId = String((p as any)?.visitorId ?? (p as any)?.RowKey ?? "").trim();
if (typeof visitorId !== "string" || !visitorId.trim()) continue;

      if (filterVisitorId && visitorId !== filterVisitorId) continue;

      const computed = computeFromProfile(p, now);

            // idempotency guard: skip already-assigned profiles unless force=true
      const alreadyAssignedTo = typeof (computed as any)?.assignedTo === "string" ? String((computed as any).assignedTo).trim() : "";
      if (!force && alreadyAssignedTo.length > 0) continue;
// Same gating as queue
      if (computed?.lastActivityAt && computed.lastActivityAt < cutoff) continue;
      if (!computed?.urgency) continue;

      const engagementEvents: any[] = [];
      const engagementFilter = `PartitionKey eq '${escapeOdataString(visitorId)}'`;
      for await (const e of engagementsTable.listEntities<any>({ queryOptions: { filter: engagementFilter } })) {
        engagementEvents.push(e);
      }

      const engagementSummary = computeEngagementSummary({
        events: engagementEvents,
        windowDays: windowDays > 0 ? windowDays : Math.ceil(windowHours / 24)
      });

      // Phase 5: downgrade urgency (still eligible unless suppressed by cooldown)
      if (engagementSummary?.engaged && computed?.urgency && computed.urgency !== "WATCH") {
        computed.urgency = "WATCH";
        computed.recommendedAction = "Light touch / confirm next step";
        computed.reason = (computed.reason ? computed.reason + " + engaged recently" : "engaged recently");
      }

      // Phase 6: cooldown suppression
      if (cooldownHours > 0) {
        const lastEngagedAtRaw = engagementSummary?.lastEngagedAt ?? null;
        if (typeof lastEngagedAtRaw === "string" && lastEngagedAtRaw.length > 0) {
          const lastMs = Date.parse(lastEngagedAtRaw);
          if (!Number.isNaN(lastMs)) {
            const hoursSinceEngaged = (now.getTime() - lastMs) / (1000 * 60 * 60);
            if (hoursSinceEngaged < cooldownHours) continue;
          }
        }
      }

      items.push({
        visitorId,
        urgency: computed.urgency as Urgency,
        lastActivityAt: computed.lastActivityAt ?? null,
        recommendedAction: computed.recommendedAction ?? null,
        reason: computed.reason ?? null,
        lastEngagedAt: engagementSummary?.lastEngagedAt ?? null,
        engagementCount: engagementSummary?.engagementCount ?? 0,
        engagementScore: engagementSummary?.score ?? null,
        engagementScoreReasons: engagementSummary?.scoreReasons ?? []
      });
    }

    items.sort((a, b) => {
      const ur = urgencyRank[a.urgency as Urgency] - urgencyRank[b.urgency as Urgency];
      if (ur !== 0) return ur;

      // tie-breaker: newest activity first
      const at = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
      const bt = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
      return bt - at;
    });

    const selected = items.slice(0, Math.min(maxResults, items.length));
    const automationRunId = `${now.toISOString()}_${Math.random().toString(36).slice(2, 10)}`;

    if (dryRun) {
  // WRITE_AUTOMATION_RUN_DRYRUN
const __runEndedAtMs = Date.now();
  const __runEndedAt = new Date(__runEndedAtMs).toISOString();

  await writeAutomationRun({
    automationRunId: String(automationRunId),
    trigger: "http",
    ok: true,
    dryRun: true,
    startedAt: __runStartedAt,
    endedAt: __runEndedAt,
    durationMs: __runEndedAtMs - __runStartedAtMs,

    scannedProfiles: Number(scannedProfiles),
    eligible: Number((items ?? []).length),
    selected: Number(selected.length),
    assignedCount: 0,

    assigneeId: String(assigneeId),

    windowHours: Number(windowHours),
    windowDays: Number(windowDays),
    cooldownHours: Number(cooldownHours),
    maxResults: Number(maxResults),
    force: Boolean(force),
  });

      return {

        status: 200,
        jsonBody: {
          ok: true,
          dryRun: true,
          automationRunId,
          scannedProfiles,
          eligible: items.length,
          maxResults,
          wouldAssign: selected.length,
          assigneeId,
          cooldownHours,
          windowHours,
          windowDays,
          items: selected
        }
      };
    }

    const assigned: any[] = [];
    for (const it of selected) {
      const input = {
        visitorId: it.visitorId,
        type: FormationEventType.FOLLOWUP_ASSIGNED,
        metadata: {
          assigneeId,
          channel,
          notes:
            baseNotes && baseNotes.trim().length > 0
              ? baseNotes
              : `Auto-assigned (${automationRunId}); urgency=${it.urgency}; reason=${it.reason ?? ""}`,
          automationRunId
        }
      };

      const v = validateFormationEvent(input as any);
      if (!v.ok) {
        assigned.push({ visitorId: it.visitorId, ok: false, error: v.error });
        continue;
      }

      const result = await recordFormationEvent(input as any, {
        storageConnectionString: connectionString,
        ensureVisitorExists: async (_visitorId: string) => {
  // no-op: auto-assign iterates existing formation profiles, so visitor already exists
}
      });

      assigned.push({
        visitorId: it.visitorId,
        ok: true,
        eventId: String((result as any)?.eventRowKey ?? (result as any)?.eventId ?? "")
      });
    }
  // WRITE_AUTOMATION_RUN_REALRUN
const __runEndedAtMs = Date.now();
  const __runEndedAt = new Date(__runEndedAtMs).toISOString();

  const __assignedCount =
    typeof (assigned as any) !== "undefined" && Array.isArray(assigned) ? assigned.length : 0;

  await writeAutomationRun({
    automationRunId: String(automationRunId),
    trigger: "http",
    ok: true,
    dryRun: false,
    startedAt: __runStartedAt,
    endedAt: __runEndedAt,
    durationMs: __runEndedAtMs - __runStartedAtMs,

    scannedProfiles: Number(scannedProfiles),
    eligible: Number((items ?? []).length),
    selected: Number(selected.length),
    assignedCount: Number(__assignedCount),

    assigneeId: String(assigneeId),

    windowHours: Number(windowHours),
    windowDays: Number(windowDays),
    cooldownHours: Number(cooldownHours),
    maxResults: Number(maxResults),
    force: Boolean(force),
  });


    return {


      status: 201,
      jsonBody: {
        ok: true,
        dryRun: false,
        automationRunId,
        scannedProfiles,
        eligible: items.length,
        selected: selected.length,
        assignedCount: assigned.filter(x => x.ok).length,
        assigneeId,
        assigned
      }
    };
  }
});












