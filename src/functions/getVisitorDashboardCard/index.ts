import { requireApiKeyForFunction } from "../_shared/apiKey";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";

const integrationService = new IntegrationService(
  new EngagementEventsRepository(),
  new AzureTableFormationEventsRepository()
);

export async function getVisitorDashboardCard(context: any, req: any): Promise<void> {
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
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const page = await integrationService.readIntegratedTimeline(visitorId, 20);

    const items = Array.isArray(page?.items) ? page.items : [];

    const latest = items[0] ?? null;

    const followupStatus =
      latest?.type === "FOLLOWUP_OUTCOME_RECORDED"
        ? "resolved"
        : latest?.type === "FOLLOWUP_CONTACTED"
        ? "contacted"
        : latest?.type === "FOLLOWUP_ASSIGNED"
        ? "pending"
        : "none";

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        visitorId,
        card: {
          visitorId,
          lastActivityAt: latest?.occurredAt ?? null,
          lastActivitySummary: latest?.summary ?? null,
          followupStatus
        }
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 500,
      body: { ok: false, error: "internal error" }
    };
  }
}
