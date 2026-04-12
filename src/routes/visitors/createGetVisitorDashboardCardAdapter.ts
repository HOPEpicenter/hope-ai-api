import type { Request, Response } from "express";
import { IntegrationService } from "../../services/integration/integrationService";

export function createGetVisitorDashboardCardAdapter(integrationService: IntegrationService) {
  return async function getVisitorDashboardCard(req: Request, res: Response) {
    const visitorId = String(req.params.id ?? "").trim();

    const page = await integrationService.readIntegratedTimeline(visitorId, 100);

    const latest = Array.isArray(page.items) && page.items.length > 0
      ? page.items[0]
      : null;

    const derivedTags = Array.isArray(page.items)
      ? (() => {
          const acc = new Map<string, boolean>();

          for (const item of page.items.slice().reverse()) {
            const tag =
              typeof item?.data?.tag === "string"
                ? item.data.tag.trim()
                : typeof item?.data?.name === "string"
                  ? item.data.name.trim()
                  : "";

            if (!tag) continue;

            if (item.type === "TAG_ADDED") acc.set(tag, true);
            if (item.type === "TAG_REMOVED") acc.delete(tag);
          }

          return Array.from(acc.keys()).sort((a, b) => a.localeCompare(b));
        })()
      : [];

    const assignedTo = Array.isArray(page.items)
      ? (() => {
          for (const item of page.items) {
            if (item?.type === "FOLLOWUP_ASSIGNED") {
              const id =
                typeof item?.data?.assigneeId === "string"
                  ? item.data.assigneeId.trim()
                  : "";
              if (id) return id;
            }
            if (item?.type === "FOLLOWUP_UNASSIGNED") return null;
          }
          return null;
        })()
      : null;

    const followupStatus =
      latest?.type === "FOLLOWUP_OUTCOME_RECORDED"
        ? "resolved"
        : latest?.type === "FOLLOWUP_CONTACTED"
          ? "contacted"
          : latest?.type === "FOLLOWUP_ASSIGNED"
            ? "pending"
            : "none";

    const attentionState =
      followupStatus === "resolved" || followupStatus === "contacted"
        ? "clear"
        : "needs_attention";

    return res.json({
      visitorId,
      card: {
        visitorId,
        lastActivityAt: latest?.occurredAt ?? null,
        lastActivitySummary: latest?.summary ?? null,
        followupStatus,
        assignedTo,
        attentionState,
        tags: derivedTags
      }
    });
  };
}
