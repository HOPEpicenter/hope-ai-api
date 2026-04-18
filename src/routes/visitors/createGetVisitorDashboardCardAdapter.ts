import type { Request, Response } from "express";
import { IntegrationService } from "../../services/integration/integrationService";

export function createGetVisitorDashboardCardAdapter(integrationService: IntegrationService) {
  return async function getVisitorDashboardCard(req: Request, res: Response) {
    const visitorId = String(req.params.id ?? "").trim();

    const page = await integrationService.readIntegratedTimeline(visitorId, 100);
    const items = Array.isArray(page.items) ? page.items : [];

    const latest = items.length > 0 ? items[0] : null;

    const hasOutcome = items.some(i => i?.type === "FOLLOWUP_OUTCOME_RECORDED");
    const hasContact = items.some(i => i?.type === "FOLLOWUP_CONTACTED");
    const hasAssigned = items.some(i => i?.type === "FOLLOWUP_ASSIGNED");

    // ✅ FIXED LOGIC
    const followupStatus = hasOutcome
      ? "resolved"
      : hasAssigned
        ? hasContact
          ? "contact_made"
          : "action_needed"
        : "none";

    const attentionState =
      followupStatus === "resolved"
        ? "clear"
        : "needs_attention";

    const assignedTo = (() => {
      for (const item of items) {
        if (item?.type === "FOLLOWUP_ASSIGNED") {
          const id = typeof item?.data?.assigneeId === "string"
            ? item.data.assigneeId.trim()
            : "";
          if (id) return id;
        }
        if (item?.type === "FOLLOWUP_UNASSIGNED") return null;
      }
      return null;
    })();

    return res.json({
      visitorId,
      card: {
        visitorId,
        lastActivityAt: latest?.occurredAt ?? null,
        lastActivitySummary: latest?.summary ?? null,
        followupStatus,
        assignedTo,
        attentionState
      }
    });
  };
}
