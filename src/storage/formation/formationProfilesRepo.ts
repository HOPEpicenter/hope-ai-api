// src/storage/formation/formationProfilesRepo.ts
import { TableClient } from "@azure/data-tables";
import { FormationStage, PHASE3_1 } from "../../domain/formation/phase3_1_scope";

export type FormationProfileEntity = {
  partitionKey: "VISITOR";
  rowKey: string; // visitorId
  visitorId: string;

  stage: FormationStage;
  stageUpdatedAt: string;
  stageUpdatedBy?: string;
  stageReason?: string;

  assignedTo?: string | null;

  // snapshot fields (Ops dashboard contract)
  lastEventType?: string;
  lastEventAt?: string;
  updatedAt?: string;

  // touchpoints (optional)
  lastServiceAttendedAt?: string;
  lastFollowupAssignedAt?: string;
  lastFollowupContactedAt?: string;
  lastFollowupOutcomeAt?: string;
  lastNextStepAt?: string;
  lastPrayerRequestedAt?: string;

  [k: string]: any;
};

export function createDefaultFormationProfile(visitorId: string): FormationProfileEntity {
  const now = new Date().toISOString();
  return {
    partitionKey: "VISITOR",
    rowKey: visitorId,
    visitorId,
    stage: PHASE3_1.DEFAULT_STAGE,
    stageUpdatedAt: now,
  };
}

function escapeOData(v: string): string {
  return String(v ?? "").replace(/'/g, "''");
}

/**
 * Azure Tables continuation token is an opaque STRING.
 * We base64 it for safe transport.
 */
function encodeCursor(token?: string): string | undefined {
  const t = String(token ?? "").trim();
  if (!t) return undefined;
  return Buffer.from(t, "utf8").toString("base64");
}

function decodeCursor(cursor?: string): string | undefined {
  const c = String(cursor ?? "").trim();
  if (!c) return undefined;
  try {
    return Buffer.from(c, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}

export async function getFormationProfile(
  table: TableClient,
  visitorId: string
): Promise<FormationProfileEntity | null> {
  try {
    const entity = await table.getEntity<FormationProfileEntity>("VISITOR", visitorId);
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

export async function upsertFormationProfile(table: TableClient, entity: FormationProfileEntity): Promise<void> {
  await table.upsertEntity(entity as any, "Merge");
}

export type FormationProfilesPage = {
  items: FormationProfileEntity[];
  cursor?: string;
};

export async function listFormationProfiles(
  table: TableClient,
  options?: {
    limit?: number;
    cursor?: string;

    visitorId?: string; // server-side RowKey filter
    stage?: FormationStage | string;
    assignedTo?: string;

    q?: string; // client-side contains
  }
): Promise<FormationProfilesPage> {
  const max = Math.max(1, Math.min(Number(options?.limit ?? 50), 200));

  // IMPORTANT: Filters must use PartitionKey/RowKey (service names), not partitionKey/rowKey.
  const filters: string[] = [`PartitionKey eq 'VISITOR'`];

  const visitorId = String(options?.visitorId ?? "").trim();
  if (visitorId) filters.push(`RowKey eq '${escapeOData(visitorId)}'`);

  const stage = String(options?.stage ?? "").trim();
  if (stage) filters.push(`stage eq '${escapeOData(stage)}'`);

  const assignedTo = String(options?.assignedTo ?? "").trim();
  if (assignedTo) filters.push(`assignedTo eq '${escapeOData(assignedTo)}'`);

  const filter = filters.join(" and ");

  const select = [
    "PartitionKey",
    "RowKey",
    "visitorId",
    "stage",
    "stageUpdatedAt",
    "stageUpdatedBy",
    "stageReason",
    "assignedTo",
    "lastEventType",
    "lastEventAt",
    "updatedAt",
    "lastServiceAttendedAt",
    "lastFollowupAssignedAt",
    "lastFollowupContactedAt",
    "lastFollowupOutcomeAt",
    "lastNextStepAt",
    "lastPrayerRequestedAt",
  ];

  const continuationToken = decodeCursor(options?.cursor);

  const pageIter = table
    .listEntities<any>({ queryOptions: { filter, select } })
    .byPage({
      maxPageSize: max,
      continuationToken,
    });

  const { value: page } = await pageIter.next();
  const entities = (page?.page ?? []) as any[];
  const nextToken = (page as any)?.continuationToken as string | undefined;

  let items: FormationProfileEntity[] = entities.map((e) => {
    const vid = String(e.visitorId ?? e.rowKey ?? "");
    return {
      ...e,
      partitionKey: "VISITOR",
      rowKey: vid,
      visitorId: vid,
    } as FormationProfileEntity;
  });

  const q = String(options?.q ?? "").trim().toLowerCase();
  if (q) {
    items = items.filter((p) => {
      const hay = [
        p.visitorId,
        String((p as any).assignedTo ?? ""),
        String((p as any).lastEventType ?? ""),
        String((p as any).stage ?? ""),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  return { items, cursor: encodeCursor(nextToken) };
}