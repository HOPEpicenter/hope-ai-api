import { requireApiKeyForFunction } from "../_shared/apiKey";
import { rebuildFormationProfileForVisitor } from "../_shared/formation";
import { buildReplayDiagnosticsEnvelope } from "../../shared/integration/replayDiagnosticsEnvelope";

export async function postFormationProfileRebuild(context: any, req: any): Promise<void> {
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

    const result = await rebuildFormationProfileForVisitor(visitorId);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitorId: result.visitorId,
        eventCount: result.eventCount,
        profile: result.profile,
        ...buildReplayDiagnosticsEnvelope({
          eventCount: result.eventCount
        })
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
