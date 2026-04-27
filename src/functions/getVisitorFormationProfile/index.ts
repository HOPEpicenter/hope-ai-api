
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
  lastNextStepCompletedAt: entity.lastNextStepCompletedAt ?? null,

    updatedAt: entity.updatedAt ?? null
  };
}
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationProfilesTableClient,
  getFormationProfileByVisitorId
} from "../_shared/formation";

export async function getVisitorFormationProfile(context: any, req: any): Promise<void> {
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
      return;
    }

    const visitorId = String(req?.params?.id ?? "").trim();
    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    const profile = await getFormationProfileByVisitorId(table, visitorId);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitorId,
        profile: mapProfile(profile) ?? null
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: err?.message ?? "Bad Request" }
    };
  }
}

