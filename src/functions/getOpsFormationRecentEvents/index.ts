import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  getFormationEventsTableClient,
  listFormationEventsByVisitorId
} from "../_shared/formation";

export async function getOpsFormationRecentEvents(context: any, req: any): Promise<void> {
  const auth = requireApiKeyForFunction(req);
  if (!auth.ok) {
    return;
  }

  const visitorId = String(req?.query?.visitorId ?? "").trim();
  if (!visitorId) {
    context.res = {
      status: 400,
      body: { ok: false, error: "visitorId is required" }
    };
    return;
  }

  const rawLimit = Number(req?.query?.limit ?? 20);
  const limit = Math.max(1, Math.min(rawLimit || 20, 100));

  try {
    const table = getFormationEventsTableClient();
    const items = await listFormationEventsByVisitorId(table, { visitorId, limit } as any);
    context.res = {
      status: 200,
      body: {
        ok: true,
        visitorId,
        count: items.length,
        items
      }
    };
  } catch (err: any) {
    context.res = {
      status: 500,
      body: {
        ok: false,
        error: String(err?.message ?? err ?? "Unknown error")
      }
    };
  }
}
