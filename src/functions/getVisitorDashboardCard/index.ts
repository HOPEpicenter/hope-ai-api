import { requireApiKeyForFunction } from "../_shared/apiKey";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { createGetVisitorSummaryAdapter } from "../../routes/visitors/createGetVisitorSummaryAdapter";
import { deriveFollowupPriority } from "../../services/followups/deriveFollowupPriority";
import { deriveFollowupState } from "../../services/followups/deriveFollowupState";
import { deriveFollowupUrgency } from "../../services/followups/deriveFollowupUrgency";

const integrationService = new IntegrationService(new EngagementEventsRepository());

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
    const state = deriveFollowupState(profile);

    const followupStatus = state.followupStatus;
    const attentionState = state.needsAttention ? "needs_attention" : "clear";

    const risk = summaryResponse?.body?.summary?.engagement?.risk ?? null;
    const priority = deriveFollowupPriority({
      needsFollowup: risk?.engagement?.needsFollowup ?? null,
      riskLevel: risk?.riskLevel ?? null,
      riskScore: risk?.riskScore ?? null
    });

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

    const followupUrgency = deriveFollowupUrgency({
      assignedTo,
      followupStatus,
      lastFollowupAssignedAt
    });

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
          followupOverdue,
          riskLevel: risk?.riskLevel ?? null,
          riskScore: risk?.riskScore ?? null,
          needsFollowup: risk?.engagement?.needsFollowup ?? null,
          recommendedAction: risk?.recommendedAction ?? null,
          priorityBand: priority.priorityBand,
          priorityScore: priority.priorityScore,
          priorityReason: priority.priorityReason
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

