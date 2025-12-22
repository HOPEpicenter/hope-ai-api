// src/storage/formation/formationTables.ts
import { TableClient } from "@azure/data-tables";

const FORMATION_PROFILES_TABLE = "FormationProfiles";
const FORMATION_EVENTS_TABLE = "FormationEvents";

/**
 * Centralized table clients for Formation (Phase 3.1)
 * No business logic here — storage only.
 */

export function getFormationProfilesTableClient(connectionString: string) {
  return TableClient.fromConnectionString(
    connectionString,
    FORMATION_PROFILES_TABLE
  );
}

export function getFormationEventsTableClient(connectionString: string) {
  return TableClient.fromConnectionString(
    connectionString,
    FORMATION_EVENTS_TABLE
  );
}

export async function ensureFormationTablesExist(connectionString: string) {
  const profiles = getFormationProfilesTableClient(connectionString);
  const events = getFormationEventsTableClient(connectionString);

  await profiles.createTable().catch(() => {});
  await events.createTable().catch(() => {});
}
