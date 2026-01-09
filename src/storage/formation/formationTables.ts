import { TableClient } from "@azure/data-tables";
import { tableName } from "../tableName";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";

export const FORMATION_PROFILES_TABLE = "FormationProfiles";
export const FORMATION_EVENTS_TABLE = "FormationEvents";
export const AUTOMATION_RUNS_TABLE_DEFAULT = "AutomationRuns";

export const FORMATION_PROFILES_PARTITION_KEY = "VISITOR";
export const FORMATION_EVENTS_PARTITION_KEY = "VISITOR";
export const AUTOMATION_RUNS_PARTITION_KEY = "RUN";

function isAzuriteConnectionString(cs: string): boolean {
  const s = String(cs ?? "").trim().toLowerCase();
  // Common dev patterns:
  // - UseDevelopmentStorage=true (shortcut)
  // - devstoreaccount1 (full Azurite connection string)
  return s.includes("usedevelopmentstorage=true") || s.includes("accountname=devstoreaccount1");
}

function makeClient(connectionString: string, logicalTable: string): TableClient {
  const options = isAzuriteConnectionString(connectionString)
    ? ({ allowInsecureConnection: true } as any)
    : undefined;

  return TableClient.fromConnectionString(connectionString, tableName(logicalTable), options as any);
}

export function getFormationProfilesTableClient(connectionString: string): TableClient {
  return makeClient(connectionString, FORMATION_PROFILES_TABLE);
}

export function getFormationEventsTableClient(connectionString: string): TableClient {
  return makeClient(connectionString, FORMATION_EVENTS_TABLE);
}

export function getAutomationRunsTableClient(): TableClient {
  const cs = process.env.STORAGE_CONNECTION_STRING;
  if (!cs) throw new Error("Missing STORAGE_CONNECTION_STRING");

  const logical =
    (process.env.AUTOMATION_RUNS_TABLE ?? "").trim() || AUTOMATION_RUNS_TABLE_DEFAULT;

  return makeClient(cs, logical);
}

export async function ensureAutomationRunsTableExists(): Promise<void> {
  const t = getAutomationRunsTableClient();
  await ensureTableExists(t);
}
