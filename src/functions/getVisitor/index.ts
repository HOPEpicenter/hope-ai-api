import { getVisitorById } from "../_shared/visitorsRepository";
import { requireApiKeyForFunction } from "../_shared/apiKey";

type GetVisitorDependencies = {
  getRecord?: typeof getVisitorById;
};

export async function getVisitor(
  context: any,
  req: any,
  dependencies: GetVisitorDependencies = {}
): Promise<void> {
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

    const visitorId = (req?.params?.visitorId ?? "").trim();

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const visitor = await (dependencies.getRecord ?? getVisitorById)(visitorId);

    if (!visitor) {
      context.res = {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "not found" }
      };
      return;
    }

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitor
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
