import { requireApiKeyForFunction } from "../_shared/apiKey";
import { getFormationProfilesTableClient, getFormationProfileByVisitorId } from "../_shared/formation";
import { readCanonicalVisitorNarrative } from "../../services/visitors/readCanonicalVisitorNarrative";

export async function getVisitorSummary(context: any, req: any): Promise<void> {
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

    const summary = await readCanonicalVisitorNarrative(
      visitorId,
      async (id) => getFormationProfileByVisitorId(table, id)
    );

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        v: 1,
        visitorId,
        summary
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: "internal error" }
    };
  }
}

