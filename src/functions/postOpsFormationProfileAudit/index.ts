import { requireApiKeyForFunction } from "../_shared/apiKey";
import { auditFormationProfileForVisitor } from "../_shared/formation";

export async function postOpsFormationProfileAudit(context: any, req: any): Promise<void> {
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

    const visitorId = String(req?.body?.visitorId ?? "").trim();
    const repair = req?.body?.repair === true;

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
          error: "visitorId is required"
        }
      };

      return;
    }

    const result = await auditFormationProfileForVisitor(visitorId, {
      repair
    });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        repair,
        ...result
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);

    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: false,
        error: err?.message ?? "Bad Request"
      }
    };
  }
}
