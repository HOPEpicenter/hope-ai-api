import { randomUUID } from "crypto";
import { TableClient } from "@azure/data-tables";

type CreateVisitorBody = {
  name?: string;
  email?: string;
};

function getConn(): string {
  // Prefer STORAGE_CONNECTION_STRING, fallback to AzureWebJobsStorage
  return process.env.STORAGE_CONNECTION_STRING
    ?? process.env.AzureWebJobsStorage
    ?? "";
}

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

    const conn = getConn();
    if (!conn) {
      context.res = {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "storage is not configured" }
      };
      return;
    }

    const visitorId = randomUUID();

    const client = TableClient.fromConnectionString(conn, "Visitors");

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
