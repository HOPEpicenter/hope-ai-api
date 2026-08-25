import { IntegrationService } from "../integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableVisitorsRepository } from "../../repositories/visitorsRepository";
import { readCanonicalVisitorSummary } from "../visitors/readCanonicalVisitorSummary";
import { deriveFollowupPriority } from "../followups/deriveFollowupPriority";
import { deriveFollowupUrgency } from "../followups/deriveFollowupUrgency";
import { projectFollowupState } from "../../functions/_shared/followupProjection";
import { TIMELINE_DERIVATION_LIMIT } from "../integration/timelineConstants";
import { readCanonicalStaffIdentity } from "../staff/readCanonicalStaffDirectory";
import type { CanonicalVisitorDashboardCard } from "./canonicalDashboardContracts";
import { readCanonicalVisitorIdentity } from "./visitorIdentity";

const integrationService = new IntegrationService(new EngagementEventsRepository());
const visitorsRepository = new AzureTableVisitorsRepository();

type ReadStaffIdentity = (
  staffId: string
) => Promise<{ displayName?: string | null } | null>;

export function resolveCanonicalDashboardCareState(input: {
  followupStatus: CanonicalVisitorDashboardCard["followupStatus"];
  integrationNeedsFollowup: boolean | null | undefined;
  integrationFollowupResolved: boolean | null | undefined;
  riskNeedsFollowup: boolean | null | undefined;
  riskRecommendedAction: string | null | undefined;
}): {
  followupResolved: boolean;
  needsFollowup: boolean | null;
  recommendedAction: string | null;
} {
  const followupResolved =
    input.integrationFollowupResolved === true ||
    input.followupStatus === "resolved";

  return {
    followupResolved,
    needsFollowup: followupResolved
      ? false
      : input.integrationNeedsFollowup ??
        input.riskNeedsFollowup ??
        null,
    recommendedAction: followupResolved
      ? "Care follow-up completed"
      : input.riskRecommendedAction ?? null
  };
}

export function resolveCanonicalVisitorDisplayName(
  visitorId: string,
  visitor: unknown
): string | null {
  return readCanonicalVisitorIdentity(
    visitorId,
    visitor
  ).displayName;
}

export async function resolveCanonicalAssignedStaffName(
  assignedTo: string | null | undefined,
  fallbackName: string | null | undefined,
  readStaffIdentity: ReadStaffIdentity = readCanonicalStaffIdentity
): Promise<string | null> {
  const staffId = String(assignedTo ?? "").trim();

  if (!staffId) {
    return null;
  }

  const staffIdentity = await readStaffIdentity(staffId);
  const displayName = String(
    staffIdentity?.displayName ?? ""
  ).trim();

  if (displayName) {
    return displayName;
  }

  const fallback = String(fallbackName ?? "").trim();

  return fallback || staffId;
}

export async function readCanonicalVisitorDashboardCard(
  visitorId: string
): Promise<CanonicalVisitorDashboardCard> {
  const [
    page,
    visitorSummary,
    visitor
  ] = await Promise.all([
    integrationService.readIntegratedTimeline(
      visitorId,
      TIMELINE_DERIVATION_LIMIT
    ),
    readCanonicalVisitorSummary(visitorId),
    visitorsRepository.getById(visitorId)
  ]);

  const items = Array.isArray(page?.items) ? page.items : [];
  const latest = items[0] ?? null;
  const summary = visitorSummary.summary;
  const displayName = resolveCanonicalVisitorDisplayName(
    visitorId,
    visitor
  );

  const profile = summary.formation.profile ?? null;
  const projection = projectFollowupState(profile);

  const stage =
    typeof profile?.stage === "string" && profile.stage.trim().length > 0
      ? profile.stage.trim()
      : null;

  const stageReason =
    typeof profile?.stageReason === "string" && profile.stageReason.trim().length > 0
      ? profile.stageReason.trim()
      : null;

  const stageUpdatedAt =
    typeof profile?.stageUpdatedAt === "string" && profile.stageUpdatedAt.trim().length > 0
      ? profile.stageUpdatedAt.trim()
      : null;

  const stageUpdatedBy =
    typeof profile?.stageUpdatedBy === "string" && profile.stageUpdatedBy.trim().length > 0
      ? profile.stageUpdatedBy.trim()
      : null;
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

  const risk = summary.engagement?.risk ?? null;
  const integration =
    summary.integration && typeof summary.integration === "object"
      ? (summary.integration as {
          needsFollowup?: boolean | null;
          followupResolved?: boolean | null;
        })
      : null;
  const careState = resolveCanonicalDashboardCareState({
    followupStatus,
    integrationNeedsFollowup: integration?.needsFollowup,
    integrationFollowupResolved: integration?.followupResolved,
    riskNeedsFollowup: risk?.engagement?.needsFollowup,
    riskRecommendedAction: risk?.recommendedAction
  });
  const priority = deriveFollowupPriority({
    needsFollowup: careState.needsFollowup,
    riskLevel: risk?.riskLevel ?? null,
    riskScore: risk?.riskScore ?? null
  });

  const assignedTo = projection.assignedTo;
  const assignedToName =
    await resolveCanonicalAssignedStaffName(
      assignedTo,
      projection.assignedToName
    );

  const lastNextStep =
    typeof profile?.lastNextStep === "string" && profile.lastNextStep.trim().length > 0
      ? profile.lastNextStep.trim()
      : null;

  const lastNextStepAt =
    typeof profile?.lastNextStepAt === "string" && profile.lastNextStepAt.trim().length > 0
      ? profile.lastNextStepAt.trim()
      : null;

  const lastNextStepCompletedAt =
    typeof profile?.lastNextStepCompletedAt === "string" && profile.lastNextStepCompletedAt.trim().length > 0
      ? profile.lastNextStepCompletedAt.trim()
      : null;

  const lastFollowupOutcome =
    typeof profile?.lastFollowupOutcome === "string" && profile.lastFollowupOutcome.trim().length > 0
      ? profile.lastFollowupOutcome.trim()
      : null;

  const lastFollowupOutcomeAt =
    typeof profile?.lastFollowupOutcomeAt === "string" && profile.lastFollowupOutcomeAt.trim().length > 0
      ? profile.lastFollowupOutcomeAt.trim()
      : null;

  const lastPrayerRequestedAt =
    typeof profile?.lastPrayerRequestedAt === "string" && profile.lastPrayerRequestedAt.trim().length > 0
      ? profile.lastPrayerRequestedAt.trim()
      : null;

  const lastFollowupAssignedAt =
    typeof profile?.lastFollowupAssignedAt === "string" && profile.lastFollowupAssignedAt.trim().length > 0
      ? profile.lastFollowupAssignedAt.trim()
      : null;
  const lastFollowupContactedAt =
    typeof profile?.lastFollowupContactedAt === "string" && profile.lastFollowupContactedAt.trim().length > 0
      ? profile.lastFollowupContactedAt.trim()
      : null;

  const followupUrgency = deriveFollowupUrgency({
    assignedTo,
    followupStatus,
    lastFollowupAssignedAt,
    lastFollowupContactedAt
  });

  return {
    visitorId,
    displayName,
    lastActivityAt: latest?.occurredAt ?? null,
    lastActivitySummary: latest?.summary ?? null,
    stage,
    stageReason,
    stageUpdatedAt,
    stageUpdatedBy,
    lastNextStep,
    lastNextStepAt,
    lastNextStepCompletedAt,
    lastFollowupAssignedAt,
    lastFollowupOutcome,
    lastFollowupOutcomeAt,
    lastPrayerRequestedAt,
    followupStatus,
    assignedTo,
    assignedToName,
    attentionState,
    followupUrgency,
    followupOverdue: followupUrgency === "OVERDUE",
    riskLevel: risk?.riskLevel ?? null,
    riskScore: risk?.riskScore ?? null,
    needsFollowup: careState.needsFollowup,
    followupResolved: careState.followupResolved,
    recommendedAction: careState.recommendedAction,
    priorityBand: priority.priorityBand,
    priorityScore: priority.priorityScore,
    priorityReason: priority.priorityReason
  };
}
