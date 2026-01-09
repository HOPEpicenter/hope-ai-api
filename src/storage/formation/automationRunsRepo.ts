import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { makeTableClient } from "../../shared/storage/makeTableClient";
import { tableName } from "../tableName";
import type { TableClient } from "@azure/data-tables";

const DEFAULT_TABLE = "AutomationRuns";
export const AUTOMATION_RUNS_PARTITION_KEY = "RUN";

export type AutomationRunRecord = {
  automationRunId: string;
  trigger: "timer" | "http" | string;
  ok: boolean;
  dryRun: boolean;

  startedAt: string;
  endedAt: string;
  durationMs: number;

  scannedProfiles: number;
  eligible: number;
  selected?: number;
  assignedCount?: number;

  assigneeId?: string;
  windowHours?: number;
  windowDays?: number;
  cooldownHours?: number;

  // ✅ add this (Option 2)
  reassignAfterHours?: number;

  maxResults?: number;
  force?: boolean;

  error?: string | null;
};

function getAutomationRunsLogicalName(): string {
  return (process.env.AUTOMATION_RUNS_TABLE ?? "").trim() || DEFAULT_TABLE;
}

function getClient(connectionString: string): TableClient {
  // makeTableClient will apply tableName(...) internally in your shared helper
  // but we keep legacy behavior safe by passing the logical name only.
  const logical = getAutomationRunsLogicalName();
  return makeTableClient(connectionString, logical);
}

export async function writeAutomationRun(record: AutomationRunRecord): Promise<void> {
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("Missing STORAGE_CONNECTION_STRING");

  const client = getClient(connectionString);
  await ensureTableExists(client);

  const entity: any = {
    partitionKey: AUTOMATION_RUNS_PARTITION_KEY,
    rowKey: record.automationRunId,

    automationRunId: record.automationRunId,
    trigger: record.trigger,
    ok: Boolean(record.ok),
    dryRun: Boolean(record.dryRun),

    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationMs: Number(record.durationMs),

    scannedProfiles: Number(record.scannedProfiles),
    eligible: Number(record.eligible),

    selected: record.selected != null ? Number(record.selected) : undefined,
    assignedCount: record.assignedCount != null ? Number(record.assignedCount) : undefined,

    assigneeId: record.assigneeId ?? undefined,
    windowHours: record.windowHours != null ? Number(record.windowHours) : undefined,
    windowDays: record.windowDays != null ? Number(record.windowDays) : undefined,
    cooldownHours: record.cooldownHours != null ? Number(record.cooldownHours) : undefined,

    // ✅ stored when provided
    reassignAfterHours: record.reassignAfterHours != null ? Number(record.reassignAfterHours) : undefined,

    maxResults: record.maxResults != null ? Number(record.maxResults) : undefined,
    force: record.force != null ? Boolean(record.force) : undefined,

    error: record.error ?? null
  };

  // Upsert (Replace) so repeated ids are deterministic
  await client.upsertEntity(entity, "Replace");
}

export async function cleanupAutomationRuns(args: {
  retentionDays: number | string;
  maxDelete: number | string;
}): Promise<{
  ok: true;
  retentionDays: number;
  cutoffIso: string;
  scanned: number;
  deleted: number;
  note?: string;
}> {
  const connectionString = process.env.STORAGE_CONNECTION_STRING;
  if (!connectionString) throw new Error("Missing STORAGE_CONNECTION_STRING");

  const retentionDays = Number(args.retentionDays);
  const maxDelete = Number(args.maxDelete);

  const safeRetentionDays = Number.isFinite(retentionDays) && retentionDays > 0 ? Math.floor(retentionDays) : 30;
  const safeMaxDelete = Number.isFinite(maxDelete) && maxDelete > 0 ? Math.floor(maxDelete) : 200;

  const cutoffMs = Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const client = getClient(connectionString);
  await ensureTableExists(client);

  const filter = `PartitionKey eq '${AUTOMATION_RUNS_PARTITION_KEY}' and startedAt lt '${cutoffIso}'`;

  let scanned = 0;
  let deleted = 0;

  for await (const e of client.listEntities<any>({ queryOptions: { filter } })) {
    scanned++;
    if (deleted >= safeMaxDelete) break;

    const pk = String((e as any).partitionKey ?? (e as any).PartitionKey ?? AUTOMATION_RUNS_PARTITION_KEY);
    const rk = String((e as any).rowKey ?? (e as any).RowKey ?? "");
    if (!rk) continue;

    await client.deleteEntity(pk, rk);
    deleted++;
  }

  return {
    ok: true,
    retentionDays: safeRetentionDays,
    cutoffIso,
    scanned,
    deleted,
    note: deleted >= safeMaxDelete ? `Hit maxDelete=${safeMaxDelete}; run again next timer tick.` : undefined
  };
}
