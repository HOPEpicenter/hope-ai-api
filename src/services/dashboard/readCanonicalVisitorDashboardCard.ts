import { IntegrationService } from "../integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { createGetVisitorSummaryAdapter } from "../../routes/visitors/createGetVisitorSummaryAdapter";
import { deriveFollowupPriority } from "../followups/deriveFollowupPriority";
import { deriveFollowupUrgency } from "../followups/deriveFollowupUrgency";
import { projectFollowupState } from "../../functions/_shared/followupProjection";
import { TIMELINE_DERIVATION_LIMIT } from "../integration/timelineConstants";

const integrationService = new IntegrationService(new EngagementEventsRepository());

export type CanonicalVisitorDashboardCard = {
  visitorId: string;
  lastActivityAt: string | null;
  lastActivitySummary: string | null;
  followupStatus: "action_needed" | "contact_made" | "resolved" | "unassigned";
  assignedTo: string | null;
  assignedToName: string | null;
  attentionState: "needs_attention" | "clear";
  followupUrgency: "OVERDUE" | "AT_RISK" | "ON_TRACK" | null;
  followupOverdue: boolean;
  riskLevel: string | null;
  riskScore: number | null;
  needsFollowup: boolean | null;
  recommendedAction: string | null;
  priorityBand: "urgent" | "high" | "normal" | "low";
  priorityScore: number;
  priorityReason: string;
};

export async function readCanonicalVisitorDashboardCard(
  visitorId: string
): Promise<CanonicalVisitorDashboardCard> {
  const page = await integrationService.readIntegratedTimeline(visitorId, TIMELINE_DERIVATION_LIMIT);
  const items = Array.isArray(page?.items) ? page.items : [];
  const latest = items[0] ?? null;

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
  const projection = projectFollowupState(profile);

  const followupStatus =
    projection.followupState === "Assigned"
      ? "action_needed"
      : projection.followupState === "Contacted"
        ? "contact_made"
        : projection.followupState === "Resolved"
          ? "resolved"
          : "unassigned";

  const attentionState =
    projection.attentionState === "Action needed"
      ? "needs_attention"
      : "clear";

  const risk = summaryResponse?.body?.summary?.engagement?.risk ?? null;
  const priority = deriveFollowupPriority({
    needsFollowup: risk?.engagement?.needsFollowup ?? null,
    riskLevel: risk?.riskLevel ?? null,
    riskScore: risk?.riskScore ?? null
  });

  const assignedTo = projection.assignedTo;
  const assignedToName = projection.assignedToName;

  const lastFollowupAssignedAt =
    typeof profile?.lastFollowupAssignedAt === "string" && profile.lastFollowupAssignedAt.trim().length > 0
      ? profile.lastFollowupAssignedAt.trim()
      : null;

  const followupUrgency = deriveFollowupUrgency({
    assignedTo,
    followupStatus,
    lastFollowupAssignedAt,
    lastFollowupContactedAt: profile?.lastFollowupContactedAt ?? null
  });

  return {
    visitorId,
    lastActivityAt: latest?.occurredAt ?? null,
    lastActivitySummary: latest?.summary ?? null,
    followupStatus,
    assignedTo,
    assignedToName,
    attentionState,
    followupUrgency,
    followupOverdue: followupUrgency === "OVERDUE",
    riskLevel: risk?.riskLevel ?? null,
    riskScore: risk?.riskScore ?? null,
    needsFollowup: risk?.engagement?.needsFollowup ?? null,
    recommendedAction: risk?.recommendedAction ?? null,
    priorityBand: priority.priorityBand,
    priorityScore: priority.priorityScore,
    priorityReason: priority.priorityReason
  };
}
