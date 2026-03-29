
function mapProfile(entity: any) {
  if (!entity) return null;

  return {
    partitionKey: entity.partitionKey,
    rowKey: entity.rowKey,
    visitorId: entity.visitorId,

    assignedTo: entity.assignedTo ?? null,

    stage: entity.stage ?? null,
    stageReason: entity.stageReason ?? null,
    stageUpdatedAt: entity.stageUpdatedAt ?? null,
    stageUpdatedBy: entity.stageUpdatedBy ?? null,

    lastEventId: entity.lastEventId ?? null,
    lastEventType: entity.lastEventType ?? null,
    lastEventAt: entity.lastEventAt ?? null,

    lastFollowupAssignedAt: entity.lastFollowupAssignedAt ?? null,
    lastFollowupContactedAt: entity.lastFollowupContactedAt ?? null,
    lastFollowupOutcome: entity.lastFollowupOutcome ?? null,
    lastFollowupOutcomeAt: entity.lastFollowupOutcomeAt ?? null,
    lastFollowupOutcomeNotes: entity.lastFollowupOutcomeNotes ?? null,

    lastNextStepAt: entity.lastNextStepAt ?? null,

    updatedAt: entity.updatedAt ?? null
  };
}
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationProfilesTableClient,
  getFormationProfileByVisitorId,
  listFormationProfiles
} from "../_shared/formation";

function parseLimit(val: unknown, fallback = 50): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 200));
}

export async function getFormationProfiles(context: any, req: any): Promise<any> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      return {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
    }

    const limit = parseLimit(req?.query?.limit, 50);
    const cursor = req?.query?.cursor ? String(req.query.cursor) : undefined;
    const stage = req?.query?.stage ? String(req.query.stage).trim() : undefined;
    const assignedTo = req?.query?.assignedTo ? String(req.query.assignedTo).trim() : undefined;
    const q = req?.query?.q ? String(req.query.q).trim() : undefined;
    const visitorIdQ = req?.query?.visitorId ? String(req.query.visitorId).trim() : undefined;

    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    let items: any[] = [];
    let nextCursor: string | null = null;

    if (visitorIdQ) {
      const one = await getFormationProfileByVisitorId(table, visitorIdQ);
      items = one
        ? [mapProfile(one)]
        : [];
    } else {
      const out = await listFormationProfiles(table, {
        limit,
        cursor,
        stage,
        assignedTo,
        q
      });

      items = out.items.map((item: any) => mapProfile(item));
      nextCursor = out.cursor ?? null;
    }

    return {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        items,
        cursor: nextCursor,
        source: "function-formation-profiles-return-v1"
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    return {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: err?.message ?? "Bad Request" }
    };
  }
}



