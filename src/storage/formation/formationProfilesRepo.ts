import { TableClient } from "@azure/data-tables";
import { FormationStage, PHASE3_1 } from "../../domain/formation/phase3_1_scope";

export type FormationProfileEntity = {
  partitionKey: "VISITOR";
  rowKey: string;
  visitorId: string;

  stage: FormationStage;
  stageUpdatedAt: string;
  stageUpdatedBy?: string;
  stageReason?: string;

  assignedTo?: string | null;

  lastEventType?: string;
  lastEventAt?: string;
  updatedAt?: string;

  lastServiceAttendedAt?: string;
  lastFollowupAssignedAt?: string;
  lastFollowupContactedAt?: string;
  lastFollowupOutcomeAt?: string;
  lastNextStepAt?: string;
  lastPrayerRequestedAt?: string;

  groupsJson?: string;

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

/**
 * 🔒 STORAGE BOUNDARY (safe)
 */
function serializeGroups(entity: any): any {
  if (Array.isArray(entity.groups)) {
    const { groups, ...rest } = entity;
    return {
      ...rest,
      groupsJson: JSON.stringify(groups),
    };
  }
  return entity;
}

function deserializeGroups(entity: any): any {
  if (entity && typeof entity.groupsJson === "string") {
    try {
      return {
        ...entity,
        groups: JSON.parse(entity.groupsJson),
      };
    } catch {
      return { ...entity, groups: [] };
    }
  }
  return entity;
}

function escapeOData(v: string): string {
  return String(v ?? "").replace(/'/g, "''");
}

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

    return deserializeGroups({
      ...entity,
      partitionKey: "VISITOR",
      rowKey: visitorId,
      visitorId,
    });
  } catch (err: any) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

export async function upsertFormationProfile(
  table: TableClient,
  entity: FormationProfileEntity
): Promise<void> {
  await table.upsertEntity(serializeGroups(entity) as any, "Replace");
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
    visitorId?: string;
    stage?: FormationStage | string;
    assignedTo?: string;
    q?: string;
  }
): Promise<FormationProfilesPage> {
  const max = Math.max(1, Math.min(Number(options?.limit ?? 50), 200));

  const filters: string[] = [`PartitionKey eq 'VISITOR'`];

  const visitorId = String(options?.visitorId ?? "").trim();
  if (visitorId) filters.push(`RowKey eq '${escapeOData(visitorId)}'`);

  const filter = filters.join(" and ");
  const continuationToken = decodeCursor(options?.cursor);

  const pageIter = table
    .listEntities<any>({ queryOptions: { filter } })
    .byPage({
      maxPageSize: max,
      continuationToken,
    });

  const { value: page } = await pageIter.next();
  const entities = (page?.page ?? []) as any[];
  const nextToken = (page as any)?.continuationToken as string | undefined;

  const items: FormationProfileEntity[] = entities.map((e) => {
    const vid = String(e.visitorId ?? e.rowKey ?? "");

    return deserializeGroups({
      ...e,
      partitionKey: "VISITOR",
      rowKey: vid,
      visitorId: vid,
    }) as FormationProfileEntity;
  });

  return { items, cursor: encodeCursor(nextToken) };
}
