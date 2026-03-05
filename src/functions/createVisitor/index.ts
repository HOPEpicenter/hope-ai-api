import { randomUUID } from "crypto";
import { ensureTable, getTableClient } from "../_shared/tableClient";

type CreateVisitorBody = {
  name?: string;
  email?: string;
};

export async function createVisitor(context: any, req: any): Promise<void> {
  try {
    const body = (req.body ?? {}) as CreateVisitorBody;
    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim();

    if (!name || !email) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "name and email are required" }
      };
      return;
    }

    const visitorId = randomUUID();
    const client = getTableClient("Visitors");

    await ensureTable(client);

    await client.createEntity({
      partitionKey: "visitors",
      rowKey: visitorId,
      name,
      email,
      createdAt: new Date().toISOString()
    });

    context.res = {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: true, visitorId }
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
