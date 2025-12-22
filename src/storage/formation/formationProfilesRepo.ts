// src/storage/formation/formationProfilesRepo.ts
import { TableEntityResult } from "@azure/data-tables";
import { FormationStage, PHASE3_1 } from "../../domain/formation/phase3_1_scope";

export type FormationProfileEntity = {
  partitionKey: "VISITOR";
  rowKey: string; // visitorId

  visitorId: string;

  stage: FormationStage;
  stageUpdatedAt: string;
  stageUpdatedBy: string;
  stageReason: string;

  assignedTo?: string;

  lastServiceAttendedAt?: string;
  lastFollowupAssignedAt?: string;
  lastFollowupContactedAt?: string;
  lastNextStepAt?: string;
  lastPrayerRequestedAt?: string;
};

export function createDefaultFormationProfile(visitorId: string): FormationProfileEntity {
  const now = new Date().toISOString();

  return {
    partitionKey: "VISITOR",
    rowKey: visitorId,
    visitorId,

    stage: PHASE3_1.DEFAULT_STAGE,
    stageUpdatedAt: now,
    stageUpdatedBy: "system",
    stageReason: "initial creation",

    assignedTo: undefined,
  };
}

export type FormationProfileResult = TableEntityResult<FormationProfileEntity>;
import { TableClient } from "@azure/data-tables";

/** Get profile entity or null */
export async function getFormationProfile(
  table: TableClient,
  visitorId: string
): Promise<FormationProfileEntity | null> {
  try {
    const entity = await table.getEntity<FormationProfileEntity>("VISITOR", visitorId);
    // normalize azure fields -> our shape
    return {
      ...entity,
      partitionKey: "VISITOR",
      rowKey: visitorId,
      visitorId,
    };
  } catch (err: any) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

/** Upsert profile entity (merge) */
export async function upsertFormationProfile(
  table: TableClient,
  entity: FormationProfileEntity
): Promise<void> {
  await table.upsertEntity(entity, "Merge");
}
