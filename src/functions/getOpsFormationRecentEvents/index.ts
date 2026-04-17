import { requireApiKeyForFunction } from "../_shared/apiKey";
import { getFormationEventsTableClient } from "../../storage/formation/formationTables";
import { listRecentFormationEvents } from "../../storage/formation/formationEventsRepo";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";

export async function getOpsFormationRecentEvents(context: any, req: any): Promise<void> {
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

    const limitRaw = Number(req?.query?.limit ?? 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 10;
    const since =
      typeof req?.query?.since === "string" && req.query.since.trim().length > 0
        ? req.query.since.trim()
        : undefined;

    const table = getFormationEventsTableClient();
    await ensureTableExists(table);

    const items = await listRecentFormationEvents(table as any, {
      limit,
      since
    });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        items
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: false,
        error: err?.message ?? "FAILED_TO_LOAD_RECENT_FORMATION_EVENTS"
      }
    };
  }
}
