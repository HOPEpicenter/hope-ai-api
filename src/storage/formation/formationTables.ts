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
