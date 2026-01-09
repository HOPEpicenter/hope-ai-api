import { TableClient } from "@azure/data-tables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { makeTableClient } from "../../shared/storage/makeTableClient";
import { tableName } from "../tableName";

export const FORMATION_PROFILES_PARTITION_KEY = "VISITOR";

export type FormationProfileEntity = {
  partitionKey: string; // "VISITOR"
  rowKey: string;       // visitorId
  visitorId: string;

  stage?: string;
  assignedTo?: string | null;

  lastEventType?: string | null;
  lastEventAt?: string | null;

  lastFollowupAssignedAt?: string | null;

  updatedAt?: string | null;
};

function getProfilesTableName(): string {
  return tableName(process.env.FORMATION_PROFILES_TABLE || "FormationProfiles");
}

export function getFormationProfilesTableClient(connectionString: string): TableClient {
  return makeTableClient(connectionString, getProfilesTableName());
}

export async function getFormationProfileEntity(
  connectionString: string,
  visitorId: string
): Promise<FormationProfileEntity | null> {
  const table = getFormationProfilesTableClient(connectionString);
  await ensureTableExists(table);

  try {
    const e = await table.getEntity<any>(FORMATION_PROFILES_PARTITION_KEY, visitorId);
    return e as FormationProfileEntity;
  } catch (err: any) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

export async function upsertFormationProfileEntity(
  connectionString: string,
  entity: FormationProfileEntity
): Promise<void> {
  const table = getFormationProfilesTableClient(connectionString);
  await ensureTableExists(table);

  // merge keeps any fields you don't set
  await table.upsertEntity(entity as any, "Merge");
}
