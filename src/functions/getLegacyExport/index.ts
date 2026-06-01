import { requireApiKeyForFunction } from "../_shared/apiKey";
import { AzureTableVisitorsRepository } from "../../repositories/visitorsRepository";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { LegacyExportService } from "../../services/legacy/legacyExportService";

export async function getLegacyExport(context: any, req: any): Promise<void> {
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

    const visitorId = String(req?.query?.visitorId ?? "").trim();
    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const rawLimit = Number(req?.query?.limit ?? 500);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(1000, Math.trunc(rawLimit)))
      : 500;

    const service = new LegacyExportService(
      new AzureTableVisitorsRepository(),
      new EngagementEventsRepository(),
      new AzureTableFormationEventsRepository()
    );

    const payload = await service.exportVisitor(visitorId, limit);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: payload
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: err?.message ?? "Bad Request" }
    };
  }
}