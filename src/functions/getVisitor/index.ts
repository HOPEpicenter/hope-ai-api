import { ensureTable, getTableClient } from "../_shared/tableClient";

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

    const client = getTableClient("Visitors");
    await ensureTable(client);

    const entity = await client.getEntity("visitors", visitorId);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitor: {
          visitorId: entity.rowKey,
          name: entity.name,
          email: entity.email,
          createdAt: entity.createdAt
        }
      }
    };
  } catch (err: any) {
    // Azure Tables throws for 404; try to treat as Not Found
    const code = err?.statusCode ?? err?.status;
    if (code === 404) {
      context.res = {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "not found" }
      };
      return;
    }

    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: "internal error" }
    };
  }
}
