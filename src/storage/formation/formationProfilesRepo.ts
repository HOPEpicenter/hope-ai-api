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
