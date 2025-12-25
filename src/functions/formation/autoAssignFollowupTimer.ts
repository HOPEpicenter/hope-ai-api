import { app, InvocationContext, Timer } from "@azure/functions";
import { TableClient } from "@azure/data-tables";

import { tableName } from "../../storage/tableName";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";
import { computeFromProfile } from "../../domain/formation/computeFromProfile";
import { validateFormationEvent, FormationEventType } from "../../domain/formation/phase3_1_scope";
import { recordFormationEvent } from "../../domain/formation/recordFormationEvent";

const ENGAGEMENTS_TABLE = "Engagements";

function getEngagementsTableClient(connectionString: string): TableClient {
  return TableClient.fromConnectionString(connectionString, tableName(ENGAGEMENTS_TABLE));
}

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (!v) return fallback;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function parseIntSafe(v: string | undefined, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function escapeOdataString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function autoAssignFollowupTimer(myTimer: Timer, context: InvocationContext): Promise<void> {
  const enabled = parseBool(process.env.AUTO_ASSIGN_ENABLED, false);
  if (!enabled) {
    context.log("autoAssignFollowupTimer: disabled (AUTO_ASSIGN_ENABLED=false)");
    return;
  }

  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("Missing STORAGE_CONNECTION_STRING");

  const assigneeId = (process.env.AUTO_ASSIGN_ASSIGNEE_ID ?? "ph7-auto").trim();
  const maxResults = parseIntSafe(process.env.AUTO_ASSIGN_MAX_RESULTS, 10);
  const windowHours = parseIntSafe(process.env.AUTO_ASSIGN_WINDOW_HOURS, 168);
  const windowDays = parseIntSafe(process.env.AUTO_ASSIGN_WINDOW_DAYS, 14);
  const cooldownHours = parseIntSafe(process.env.AUTO_ASSIGN_COOLDOWN_HOURS, 24);
  const force = parseBool(process.env.AUTO_ASSIGN_FORCE, false);

  const now = new Date();
  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const automationRunId = `${new Date().toISOString()}_${Math.random().toString(36).slice(2, 10)}`;

  const profilesTable = getFormationProfilesTableClient(connectionString);
  await ensureTableExists(profilesTable);

  const engagementsTable = getEngagementsTableClient(connectionString);
  await ensureTableExists(engagementsTable);

  let scannedProfiles = 0;
  let eligible = 0;
  let assignedCount = 0;

  for await (const p of profilesTable.listEntities<any>()) {
    scannedProfiles++;
    if (assignedCount >= maxResults) break;

    const visitorId = String((p as any)?.visitorId ?? (p as any)?.RowKey ?? "").trim();
    if (!visitorId) continue;

    const computed = computeFromProfile(p, now);

    // Same gating as queue
    if (computed?.lastActivityAt && computed.lastActivityAt < cutoff) continue;
    if (!computed?.urgency) continue;

    // Idempotency guard: skip already-assigned unless force=true
    const alreadyAssignedTo = typeof (computed as any)?.assignedTo === "string" ? String((computed as any).assignedTo).trim() : "";
    if (!force && alreadyAssignedTo.length > 0) continue;

    // Cooldown suppression (Phase 6): suppress if engaged within cooldown window
    if (cooldownHours > 0) {
      const engagementFilter = `PartitionKey eq '${escapeOdataString(visitorId)}'`;
      let lastEngagedAt: string | null = null;

      for await (const e of engagementsTable.listEntities<any>({ queryOptions: { filter: engagementFilter } })) {
        const occurredAt = (e as any).occurredAt;
        if (typeof occurredAt === "string") {
          if (!lastEngagedAt || occurredAt > lastEngagedAt) lastEngagedAt = occurredAt;
        }
      }

      if (lastEngagedAt) {
        const lastMs = Date.parse(lastEngagedAt);
        if (!Number.isNaN(lastMs)) {
          const hoursSince = (now.getTime() - lastMs) / (1000 * 60 * 60);
          if (hoursSince < cooldownHours) continue;
        }
      }
    }

    eligible++;

    const input = {
      visitorId,
      type: FormationEventType.FOLLOWUP_ASSIGNED,
      metadata: {
        assigneeId,
        channel: "auto",
        notes: "Timer auto-assign",
        automationRunId
      }
    };

    const v = validateFormationEvent(input as any);
    if (!v.ok) {
      context.warn(`autoAssignFollowupTimer: validation failed visitorId=${visitorId}: ${v.error}`);
      continue;
    }

    try {
      await recordFormationEvent(input as any, {
        storageConnectionString: connectionString,
        ensureVisitorExists: async (_visitorId: string) => {
          // no-op: profiles already exist for real visitors
        }
      });
      assignedCount++;
    } catch (err: any) {
      context.warn(`autoAssignFollowupTimer: recordFormationEvent failed visitorId=${visitorId}`, err?.message ?? err);
    }
  }

  context.log(JSON.stringify({
    ok: true,
    automationRunId,
    scannedProfiles,
    eligible,
    assignedCount,
    assigneeId,
    windowHours,
    windowDays,
    cooldownHours,
    force
  }));
}

const cron = (process.env.AUTO_ASSIGN_CRON ?? "0 */5 * * * *").trim();

app.timer("autoAssignFollowupTimer", {
  schedule: cron,
  handler: autoAssignFollowupTimer
});
