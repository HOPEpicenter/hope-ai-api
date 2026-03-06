import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureFormationTables,
  recordFormationEventV1,
  toFormationHttpError
} from "../_shared/formation";

export async function postFormationEvent(context: any, req: any): Promise<void> {
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

    await ensureFormationTables();

    const body = req?.body ?? {};
    const result = await recordFormationEventV1(body);

    context.res = {
      status: result.accepted ? 201 : 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        accepted: result.accepted,
        id: result.id,
        visitorId: result.visitorId,
        type: result.type,
        occurredAt: result.occurredAt,
        rowKey: result.rowKey,
        profile: result.profile
      }
    };
  } catch (error: any) {
    context.log.error(error?.message ?? error);
    const status = toFormationHttpError(error, 400);
    context.res = {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: error?.message || "Bad Request" }
    };
  }
}
