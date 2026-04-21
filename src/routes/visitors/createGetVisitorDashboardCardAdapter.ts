import type { Request, Response } from "express";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { readEngagementRiskV1 } from "../../services/engagements/readEngagementRisk";
import { deriveFollowupPriority } from "../../services/followups/deriveFollowupPriority";

const engagementsService = new EngagementsService(new EngagementEventsRepository());

export function createGetVisitorDashboardCardAdapter(integrationService: IntegrationService) {
  return async function getVisitorDashboardCard(req: Request, res: Response) {
    const visitorId = String(req.params.id ?? "").trim();

    const page = await integrationService.readIntegratedTimeline(visitorId, 100);
    const items = Array.isArray(page.items) ? page.items : [];
    const latest = items.length > 0 ? items[0] : null;

    const hasOutcome = items.some(i => i?.type === "FOLLOWUP_OUTCOME_RECORDED");
    const hasContact = items.some(i => i?.type === "FOLLOWUP_CONTACTED");
    const hasAssigned = items.some(i => i?.type === "FOLLOWUP_ASSIGNED");

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

    const risk = await readEngagementRiskV1(engagementsService, visitorId, 14);
    const priority = deriveFollowupPriority({
      needsFollowup: risk.engagement.needsFollowup,
      riskLevel: risk.riskLevel,
      riskScore: risk.riskScore
    });

    return res.json({
      visitorId,
      card: {
        visitorId,
        lastActivityAt: latest?.occurredAt ?? null,
        lastActivitySummary: latest?.summary ?? null,
        followupStatus,
        assignedTo,
        attentionState,
        riskLevel: risk.riskLevel,
        riskScore: risk.riskScore,
        needsFollowup: risk.engagement.needsFollowup,
        recommendedAction: risk.recommendedAction,
        priorityBand: priority.priorityBand,
        priorityScore: priority.priorityScore,
        priorityReason: priority.priorityReason
      }
    });
  };
}

