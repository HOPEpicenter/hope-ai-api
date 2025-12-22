// src/storage/formation/formationEventsRepo.ts
import { TableEntityResult } from "@azure/data-tables";
import {
  FormationEventType,
  FormationVisibility,
  FormationSensitivity,
} from "../../domain/formation/phase3_1_scope";

export type FormationEventEntity = {
  partitionKey: string; // visitorId
  rowKey: string; // ISO timestamp + random suffix

  visitorId: string;
  type: FormationEventType;

  occurredAt: string;
  recordedAt: string;

  channel: string;
  visibility: FormationVisibility;
  sensitivity: FormationSensitivity;

  summary?: string;
  metadata?: string; // JSON string
  idempotencyKey?: string;
};

export type FormationEventResult = TableEntityResult<FormationEventEntity>;
