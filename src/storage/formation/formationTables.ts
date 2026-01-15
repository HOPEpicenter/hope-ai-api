import { TableClient } from "@azure/data-tables";
import { makeTableClient } from "../../shared/storage/makeTableClient";

// ---- Table names (dev defaults) ----
// Keep these stable; they show up in debug output and scripts.
export const FORMATION_EVENTS_TABLE = process.env.FORMATION_EVENTS_TABLE || "devFormationEvents";
export const FORMATION_PROFILES_TABLE = process.env.FORMATION_PROFILES_TABLE || "devFormationProfiles";
export const AUTOMATION_RUNS_TABLE = process.env.AUTOMATION_RUNS_TABLE || "devAutomationRuns";

// ---- Partition Keys ----
// These must match what your code writes/queries.
export const FORMATION_PARTITION_KEY = "VISITOR";
export const AUTOMATION_RUNS_PARTITION_KEY = "RUN";

function resolveStorageConnectionString(explicit?: string): string {
  const cs =
    explicit ||
    process.env.STORAGE_CONNECTION_STRING ||
    process.env.AzureWebJobsStorage ||
    "";

  if (!cs) {
    throw new Error(
      "Storage connection string missing. Set STORAGE_CONNECTION_STRING (preferred) or AzureWebJobsStorage."
    );
  }
  return cs;
}

// NOTE: These accept an optional connection string so older call sites compiling with cs args keep working.
export function getFormationEventsTableClient(connectionString?: string): TableClient {
  const cs = resolveStorageConnectionString(connectionString);
  return makeTableClient(cs, FORMATION_EVENTS_TABLE);
}

export function getFormationProfilesTableClient(connectionString?: string): TableClient {
  const cs = resolveStorageConnectionString(connectionString);
  return makeTableClient(cs, FORMATION_PROFILES_TABLE);
}

export function getAutomationRunsTableClient(connectionString?: string): TableClient {
  const cs = resolveStorageConnectionString(connectionString);
  return makeTableClient(cs, AUTOMATION_RUNS_TABLE);
}
