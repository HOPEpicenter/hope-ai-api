import { listVisitorsRecords } from "../_shared/visitorsRepository";

function parseLimit(val: unknown, fallback = 25): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 200));
}

export async function listVisitors(context: any, req: any): Promise<void> {
  try {
    const limit = parseLimit(req?.query?.limit, 25);
    const result = await listVisitorsRecords({ limit });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        count: result.count,
        limit,
        items: result.items
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: "LIST_VISITORS_FAILED" }
    };
  }
}
