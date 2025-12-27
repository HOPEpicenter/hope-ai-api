// src/storage/formation/formationTables.ts
import { TableClient } from "@azure/data-tables";
import { tableName } from "../tableName";

export const FORMATION_PROFILES_TABLE = "FormationProfiles";
export const FORMATION_EVENTS_TABLE = "FormationEvents";

/**
 * Centralized table clients for Formation (Phase 3.1)
 * Storage-only (no business logic).
 */

export function getFormationProfilesTableClient(connectionString: string): TableClient {
  return TableClient.fromConnectionString(
    connectionString,
    tableName(FORMATION_PROFILES_TABLE)
  );
}

export function getFormationEventsTableClient(connectionString: string): TableClient {
  return TableClient.fromConnectionString(
    connectionString,
    tableName(FORMATION_EVENTS_TABLE)
  );
}

export async function ensureFormationTablesExist(connectionString: string): Promise<void> {
  const profiles = getFormationProfilesTableClient(connectionString);
  const events = getFormationEventsTableClient(connectionString);

  // Create if missing; ignore "already exists" errors.
  await profiles.createTable().catch(() => {});
  await events.createTable().catch(() => {});
}

/** Phase 8: Automation run metrics */
export const AUTOMATION_RUNS_PARTITION_KEY = "AUTO_ASSIGN";

export function getAutomationRunsTableClient(): TableClient {
  const name = process.env.AUTOMATION_RUNS_TABLE || "AutomationRuns";
  const cs = process.env.STORAGE_CONNECTION_STRING || process.env.AzureWebJobsStorage;
  if (!cs) throw new Error("STORAGE_CONNECTION_STRING (or AzureWebJobsStorage) missing");
  return TableClient.fromConnectionString(cs, tableName(name));
}

export async function ensureAutomationRunsTableExists(): Promise<void> {
  const t = getAutomationRunsTableClient();
  await t.createTable().catch(() => {});
}
