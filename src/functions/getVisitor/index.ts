import { getVisitorById } from "../_shared/visitorsRepository";

export async function getVisitor(context: any, req: any): Promise<void> {
  try {
    const visitorId = (req?.params?.visitorId ?? "").trim();

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const visitor = await getVisitorById(visitorId);

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
