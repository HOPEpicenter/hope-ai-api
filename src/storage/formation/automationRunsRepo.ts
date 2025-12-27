import { ensureAutomationRunsTableExists, getAutomationRunsTableClient, AUTOMATION_RUNS_PARTITION_KEY } from "./formationTables";

export type AutomationRunEntity = {
  automationRunId: string;
  trigger: "http" | "timer";
  ok: boolean;
  dryRun?: boolean;

  startedAt: string;
  endedAt?: string;
  durationMs?: number;

  scannedProfiles?: number;
  eligible?: number;
  selected?: number;
  assignedCount?: number;

  assigneeId?: string;
  windowHours?: number;
  windowDays?: number;
  cooldownHours?: number;
  maxResults?: number;
  force?: boolean;

  error?: string;
};

export async function writeAutomationRun(run: AutomationRunEntity): Promise<void> {
  await ensureAutomationRunsTableExists();
  const table = getAutomationRunsTableClient();

  const entity: any = {
    partitionKey: AUTOMATION_RUNS_PARTITION_KEY,
    rowKey: String(run.automationRunId),

    trigger: run.trigger,
    ok: Boolean(run.ok),
    dryRun: run.dryRun ?? null,

    startedAt: run.startedAt,
    endedAt: run.endedAt ?? null,
    durationMs: typeof run.durationMs === "number" ? run.durationMs : null,

    scannedProfiles: typeof run.scannedProfiles === "number" ? run.scannedProfiles : null,
    eligible: typeof run.eligible === "number" ? run.eligible : null,
    selected: typeof run.selected === "number" ? run.selected : null,
    assignedCount: typeof run.assignedCount === "number" ? run.assignedCount : null,

    assigneeId: run.assigneeId ?? null,
    windowHours: typeof run.windowHours === "number" ? run.windowHours : null,
    windowDays: typeof run.windowDays === "number" ? run.windowDays : null,
    cooldownHours: typeof run.cooldownHours === "number" ? run.cooldownHours : null,
    maxResults: typeof run.maxResults === "number" ? run.maxResults : null,
    force: typeof run.force === "boolean" ? run.force : null,

    error: run.error ?? null,
  };

  // upsert is idempotent by RowKey
  await table.upsertEntity(entity, "Replace");
}
