import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  normalizeFormationWriteBody,
  recordFormationEventForFunction
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

    const input = normalizeFormationWriteBody(req?.body ?? {});
    const out = await recordFormationEventForFunction(input);

    context.res = {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        accepted: true,
        id: input.id,
        visitorId: input.visitorId,
        type: input.type,
        occurredAt: input.occurredAt,
        rowKey: out.eventRowKey,
        profile: out.profile
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
