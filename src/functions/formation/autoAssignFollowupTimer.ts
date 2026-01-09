import { app, InvocationContext, Timer } from "@azure/functions";
import { TableClient } from "@azure/data-tables";

import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { makeTableClient } from "../../shared/storage/makeTableClient";
import { tableName } from "../../storage/tableName";

import { writeAutomationRun, cleanupAutomationRuns } from "../../storage/formation/automationRunsRepo";
import { computeEngagementSummary } from "../../domain/engagement/computeEngagement";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { computeFromProfile } from "../../domain/formation/computeFromProfile";
import { validateFormationEvent, FormationEventType } from "../../domain/formation/phase3_1_scope";
import { recordFormationEvent } from "../../domain/formation/recordFormationEvent";

type Urgency = "OVERDUE" | "DUE_SOON" | "WATCH";

const ENGAGEMENTS_TABLE = "Engagements";

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

function getEngagementsTableClient(connectionString: string): TableClient {
  // Always go through makeTableClient (handles Azurite allowInsecure + Azure)
  return makeTableClient(connectionString, ENGAGEMENTS_TABLE);
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

export async function autoAssignFollowupTimer(_myTimer: Timer, context: InvocationContext): Promise<void> {
  context.log("TIMER_CODE_VERSION=2025-12-27-allow-insecure-azurite-no-options-type");

  const enabled = envBool("AUTO_ASSIGN_ENABLED", false);
  const connectionString = process.env.STORAGE_CONNECTION_STRING;

  context.log(
    "autoAssignFollowupTimer env(raw)=" +
      JSON.stringify({
        AUTO_ASSIGN_ENABLED: process.env.AUTO_ASSIGN_ENABLED,
        STORAGE_CONNECTION_STRING: connectionString ? "(set)" : "(missing)",
        AzureWebJobsStorage: process.env.AzureWebJobsStorage ? "(set)" : "(missing)"
      })
  );

  if (!enabled) {
    context.log("autoAssignFollowupTimer disabled (AUTO_ASSIGN_ENABLED=false)");
    return;
  }
  if (!connectionString) throw new Error("Missing STORAGE_CONNECTION_STRING");

  // AUTO_ASSIGN_RUN_START_TS
  const __runStartedAtMs = Date.now();
  const __runStartedAt = new Date(__runStartedAtMs).toISOString();

  const now = new Date();

  const assigneeId = (process.env.AUTO_ASSIGN_ASSIGNEE_ID || "unassigned").trim();
  const maxResults = parsePositiveInt(process.env.AUTO_ASSIGN_MAX_RESULTS, 10);
  const windowHours = parsePositiveInt(process.env.AUTO_ASSIGN_WINDOW_HOURS, 168);
  const windowDays = parsePositiveInt(process.env.AUTO_ASSIGN_WINDOW_DAYS, 14);
  const cooldownHours = parseNonNegativeInt(process.env.AUTO_ASSIGN_COOLDOWN_HOURS, 24);
  
  const reassignAfterHours = parseNonNegativeInt(process.env.AUTO_ASSIGN_REASSIGN_AFTER_HOURS, 48);const force = envBool("AUTO_ASSIGN_FORCE", false);

  context.log(
    "autoAssignFollowupTimer env(parsed)=" +
      JSON.stringify({ assigneeId, maxResults, windowHours, windowDays, cooldownHours, reassignAfterHours, force })
  );

  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  const profilesTable = getFormationProfilesTableClient(connectionString);
  await ensureTableExists(profilesTable);

  const engagementsTable = getEngagementsTableClient(connectionString);
  await ensureTableExists(engagementsTable);

  const items: any[] = [];
  let scannedProfiles = 0;

  for await (const p of profilesTable.listEntities<any>()) {
    scannedProfiles++;

    const visitorId = String((p as any)?.visitorId ?? (p as any)?.RowKey ?? "").trim();
    if (!visitorId) continue;

    const computed = computeFromProfile(p, now);    // idempotency / reassignment guard:
    // - if force=true => always eligible
    // - else if assignedTo is set, only reassign when the last assignment is older than reassignAfterHours
    const alreadyAssignedTo =
      typeof (computed as any)?.assignedTo === "string" ? String((computed as any).assignedTo).trim() : "";

    if (!force && alreadyAssignedTo.length > 0) {
      const lastAssignedAtRaw =
        (computed as any)?.lastAssignedAt ??
        (computed as any)?.assignedAt ??
        (computed as any)?.lastAssignmentAt ??
        null;

      let allowReassign = false;
      if (typeof lastAssignedAtRaw === "string" && lastAssignedAtRaw.length > 0) {
        const lastAssignedMs = Date.parse(lastAssignedAtRaw);
        if (!Number.isNaN(lastAssignedMs)) {
          const hoursSinceAssigned = (now.getTime() - lastAssignedMs) / (1000 * 60 * 60);
          allowReassign = hoursSinceAssigned >= reassignAfterHours;
        }
      }

      if (!allowReassign) continue;
    }// gating
    if (computed?.lastActivityAt && computed.lastActivityAt < cutoff) continue;
    if (!computed?.urgency) continue;

    // engagements
    const engagementEvents: any[] = [];
    const engagementFilter = `PartitionKey eq '${escapeOdataString(visitorId)}'`;
    for await (const e of engagementsTable.listEntities<any>({ queryOptions: { filter: engagementFilter } })) {
      engagementEvents.push(e);
    }

    const engagementSummary = computeEngagementSummary({
      events: engagementEvents,
      windowDays: windowDays > 0 ? windowDays : Math.ceil(windowHours / 24)
    });

    // downgrade urgency if engaged
    if (engagementSummary?.engaged && computed?.urgency && computed.urgency !== "WATCH") {
      computed.urgency = "WATCH";
      computed.recommendedAction = "Light touch / confirm next step";
      computed.reason = computed.reason ? computed.reason + " + engaged recently" : "engaged recently";
    }

    // cooldown suppression
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
      engagementCount: engagementSummary?.engagementCount ?? 0
    });
  }

  items.sort((a, b) => {
    const ur = urgencyRank[a.urgency as Urgency] - urgencyRank[b.urgency as Urgency];
    if (ur !== 0) return ur;
    const at = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const bt = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    return bt - at;
  });

  const selected = items.slice(0, Math.min(maxResults, items.length));
  const automationRunId = `${now.toISOString()}_timer_${Math.random().toString(36).slice(2, 10)}`;

  const assigned: any[] = [];
  for (const it of selected) {
    const input = {
      visitorId: it.visitorId,
      type: FormationEventType.FOLLOWUP_ASSIGNED,
      metadata: {
        assigneeId,
        channel: "auto",
        notes: `Timer auto-assign (${automationRunId}); urgency=${it.urgency}; reason=${it.reason ?? ""}`,
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
        // no-op: iterating formation profiles
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

  await writeAutomationRun({
    automationRunId: String(automationRunId),
    trigger: "timer",
    ok: true,
    dryRun: false,
    startedAt: __runStartedAt,
    endedAt: __runEndedAt,
    durationMs: __runEndedAtMs - __runStartedAtMs,

    scannedProfiles: Number(scannedProfiles),
    eligible: Number(items.length),
    selected: Number(selected.length),
    assignedCount: Number(assigned.filter(x => x.ok).length),

    assigneeId: String(assigneeId),

    windowHours: Number(windowHours),
    windowDays: Number(windowDays),
    cooldownHours: Number(cooldownHours),
    reassignAfterHours: Number(reassignAfterHours),
    maxResults: Number(maxResults),
    force: Boolean(force)
  });

  const summary = {
    ok: true,
    automationRunId,
    scannedProfiles,
    eligible: items.length,
    assignedCount: assigned.filter(x => x.ok).length,
    assigneeId,
    windowHours,
    windowDays,
    cooldownHours,
    reassignAfterHours,
    maxResults,
    force
  };

  context.log("autoAssignFollowupTimer summary=" + JSON.stringify(summary));

  // --- Phase 8 hardening: cleanup old automation runs (safe, capped) ---
  const cleanupEnabled = envBool("AUTOMATION_RUNS_CLEANUP_ENABLED", true);
  const retentionDays = parsePositiveInt(process.env.AUTOMATION_RUNS_RETENTION_DAYS, 30);
  const maxDelete = parsePositiveInt(process.env.AUTOMATION_RUNS_CLEANUP_MAX_DELETE, 200);

  context.log(
    "autoAssignFollowupTimer cleanupConfig=" + JSON.stringify({ cleanupEnabled, retentionDays, maxDelete })
  );

  if (cleanupEnabled) {
    try {
      const cr = await cleanupAutomationRuns({ retentionDays, maxDelete });
      context.log("autoAssignFollowupTimer cleanup=" + JSON.stringify(cr));
    } catch (e: any) {
      context.warn("autoAssignFollowupTimer cleanup failed: " + (e?.message ?? String(e)));
    }
  }
}

app.timer("autoAssignFollowupTimer", {
  schedule: "0 0,5,10,15,20,25,30,35,40,45,50,55 * * * *",
  handler: autoAssignFollowupTimer
});




