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

    const hasOutcomeRecorded = items.some((item: any) => item?.type === "FOLLOWUP_OUTCOME_RECORDED");
    const hasContacted = items.some((item: any) => item?.type === "FOLLOWUP_CONTACTED");
    const hasAssigned = items.some((item: any) => item?.type === "FOLLOWUP_ASSIGNED");

    const assignedTo = (() => {
      for (const item of items) {
        if (item?.type === "FOLLOWUP_ASSIGNED") {
          const assigneeId =
            typeof item?.data?.assigneeId === "string"
              ? item.data.assigneeId.trim()
              : "";
          if (assigneeId) return assigneeId;
        }

        if (item?.type === "FOLLOWUP_UNASSIGNED") {
          return null;
        }
      }

      return null;
    })();

    const lastFollowupAssignedAt = (() => {
      for (const item of items) {
        if (item?.type === "FOLLOWUP_ASSIGNED") {
          const occurredAt =
            typeof item?.occurredAt === "string" && item.occurredAt.trim().length > 0
              ? item.occurredAt.trim()
              : null;
          if (occurredAt) return occurredAt;
        }

        if (item?.type === "FOLLOWUP_UNASSIGNED") {
          return null;
        }
      }

      return null;
    })();

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


