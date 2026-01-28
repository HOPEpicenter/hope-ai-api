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

  // any extra fields
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

/** Basic OData escaping for single quotes. */
function escapeOData(v: string): string {
  return String(v ?? "").replace(/'/g, "''");
}

type Continuation = { nextPartitionKey?: string; nextRowKey?: string };

function encodeCursor(token?: Continuation): string | undefined {
  if (!token?.nextPartitionKey && !token?.nextRowKey) return undefined;
  const json = JSON.stringify({
    nextPartitionKey: token.nextPartitionKey ?? "",
    nextRowKey: token.nextRowKey ?? "",
  });
  return Buffer.from(json, "utf8").toString("base64");
}

function decodeCursor(cursor?: string): Continuation | undefined {
  const c = String(cursor ?? "").trim();
  if (!c) return undefined;
  try {
    const json = Buffer.from(c, "base64").toString("utf8");
    const o = JSON.parse(json);
    const nextPartitionKey = String(o?.nextPartitionKey ?? "").trim();
    const nextRowKey = String(o?.nextRowKey ?? "").trim();
    return {
      nextPartitionKey: nextPartitionKey || undefined,
      nextRowKey: nextRowKey || undefined,
    };
  } catch {
    return undefined;
  }
}

/** Get profile entity or null */
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

/** Upsert profile entity (merge) */
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
    stage?: FormationStage | string;
    assignedTo?: string;
    q?: string; // client-side contains filter across visitorId/assignedTo/lastEventType/stage
  }
): Promise<FormationProfilesPage> {
  const max = Math.max(1, Math.min(Number(options?.limit ?? 50), 200));

  const filters: string[] = [`PartitionKey eq 'VISITOR'`];

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

  const cont = decodeCursor(options?.cursor);

  const pageIter = table
    .listEntities<any>({ queryOptions: { filter, select } })
    .byPage({
      maxPageSize: max,
      continuationToken: cont?.nextPartitionKey || cont?.nextRowKey ? (cont as any) : undefined,
    });

  const { value: page } = await pageIter.next();
  const entities = (page?.page ?? []) as any[];
  const token = (page as any)?.continuationToken as Continuation | undefined;

  let items: FormationProfileEntity[] = entities.map((e) => {
    const vid = String(e.visitorId ?? e.RowKey ?? e.rowKey ?? "");
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

  return { items, cursor: encodeCursor(token) };
}