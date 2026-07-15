import { IntegrationService } from "../integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { readCanonicalVisitorSummary } from "../visitors/readCanonicalVisitorSummary";
import { deriveFollowupPriority } from "../followups/deriveFollowupPriority";
import { deriveFollowupUrgency } from "../followups/deriveFollowupUrgency";
import { projectFollowupState } from "../../functions/_shared/followupProjection";
import { TIMELINE_DERIVATION_LIMIT } from "../integration/timelineConstants";
import { readCanonicalStaffIdentity } from "../staff/readCanonicalStaffDirectory";
import type { CanonicalVisitorDashboardCard } from "./canonicalDashboardContracts";

const integrationService = new IntegrationService(new EngagementEventsRepository());

type ReadStaffIdentity = (
  staffId: string
) => Promise<{ displayName?: string | null } | null>;

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
  const page = await integrationService.readIntegratedTimeline(visitorId, TIMELINE_DERIVATION_LIMIT);
  const items = Array.isArray(page?.items) ? page.items : [];
  const latest = items[0] ?? null;

  const visitorSummary = await readCanonicalVisitorSummary(visitorId);
  const summary = visitorSummary.summary;

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
  const priority = deriveFollowupPriority({
    needsFollowup: risk?.engagement?.needsFollowup ?? null,
    riskLevel: risk?.riskLevel ?? null,
    riskScore: risk?.riskScore ?? null
  });

  const assignedTo = projection.assignedTo;
  const assignedToName =
    await resolveCanonicalAssignedStaffName(
      assignedTo,
      projection.assignedToName
    );

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
    lastActivityAt: latest?.occurredAt ?? null,
    lastActivitySummary: latest?.summary ?? null,
    stage,
    stageReason,
    stageUpdatedAt,
    stageUpdatedBy,
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
    needsFollowup: risk?.engagement?.needsFollowup ?? null,
    recommendedAction: risk?.recommendedAction ?? null,
    priorityBand: priority.priorityBand,
    priorityScore: priority.priorityScore,
    priorityReason: priority.priorityReason
  };
}
