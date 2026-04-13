import { requireApiKeyForFunction } from "../_shared/apiKey";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";
import { createGetVisitorSummaryAdapter } from "../../routes/visitors/createGetVisitorSummaryAdapter";

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

    const hasOutcomeRecorded = items.some((item: any) => item?.type === "FOLLOWUP_OUTCOME_RECORDED");
    const hasContacted = items.some((item: any) => item?.type === "FOLLOWUP_CONTACTED");
    const hasAssigned = items.some((item: any) => item?.type === "FOLLOWUP_ASSIGNED");

    const getVisitorSummary = createGetVisitorSummaryAdapter();
    const summaryResponse: any = {
      status: (code: number) => ({
        json: (body: any) => {
          summaryResponse.statusCode = code;
          summaryResponse.body = body;
          return summaryResponse;
        }
      }),
      json: (body: any) => {
        summaryResponse.statusCode = 200;
        summaryResponse.body = body;
        return summaryResponse;
      }
    };

    await getVisitorSummary(
      { params: { id: visitorId } } as any,
      summaryResponse as any,
      (() => {}) as any
    );

    const profile = summaryResponse?.body?.summary?.formation?.profile ?? null;

    const assignedToRaw =
      typeof profile?.assignedTo === "string"
        ? profile.assignedTo.trim()
        : typeof profile?.assignedTo?.ownerId === "string"
          ? profile.assignedTo.ownerId.trim()
          : "";

    const assignedTo = assignedToRaw.length > 0 ? assignedToRaw : null;

    const lastFollowupAssignedAt =
      typeof profile?.lastFollowupAssignedAt === "string" && profile.lastFollowupAssignedAt.trim().length > 0
        ? profile.lastFollowupAssignedAt.trim()
        : null;

    const followupStatus = hasOutcomeRecorded
      ? "resolved"
      : hasContacted
        ? "contacted"
        : hasAssigned
          ? "pending"
          : "none";

    const attentionState =
      followupStatus === "resolved" || followupStatus === "contacted"
        ? "clear"
        : "needs_attention";

    const getAgeHours = (value: string | null): number | null => {
      if (!value) return null;

      const assignedMs = new Date(value).getTime();
      if (Number.isNaN(assignedMs)) return null;

      const diffMs = Date.now() - assignedMs;
      if (diffMs < 0) return 0;

      return Math.floor(diffMs / (1000 * 60 * 60));
    };

    const ageHours = getAgeHours(lastFollowupAssignedAt);

    const followupUrgency =
      !assignedTo || followupStatus === "resolved" || followupStatus === "contacted"
        ? null
        : ageHours !== null && ageHours >= 48
          ? "OVERDUE"
          : ageHours !== null && ageHours >= 24
            ? "AT_RISK"
            : "ON_TRACK";

    const followupOverdue = followupUrgency === "OVERDUE";

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
          followupStatus,
          assignedTo,
          attentionState,
          followupUrgency,
          followupOverdue
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
