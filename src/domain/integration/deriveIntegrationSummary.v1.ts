import type { IntegrationSummaryV1 } from "../../contracts/integrationSummary.v1";

type OwnerRefV1 = {
  ownerType: "user" | "team";
  ownerId: string;
  displayName?: string;
};

export type DeriveIntegrationSummaryInput = {
  visitorId: string;
  lastEngagementAt: string | null;
  lastFormationAt: string | null;
  assignedToUserId?: string | null;
};

function maxIso(a?: string | null, b?: string | null): string | null {
  const av = String(a ?? "").trim();
  const bv = String(b ?? "").trim();

  if (!av) return bv || null;
  if (!bv) return av || null;

  return av >= bv ? av : bv;
}

export function deriveIntegrationSummaryV1(
  input: DeriveIntegrationSummaryInput
): IntegrationSummaryV1 {
  const assignedToUserId = String(input.assignedToUserId ?? "").trim();

  const assignedTo: OwnerRefV1 | undefined =
    assignedToUserId
      ? {
          ownerType: "user",
          ownerId: assignedToUserId,
        }
      : undefined;

  const hasAssignee = !!assignedTo;
  const lastIntegratedAt = maxIso(input.lastEngagementAt, input.lastFormationAt);

  return {
    visitorId: input.visitorId,
    lastEngagementAt: input.lastEngagementAt,
    lastFormationAt: input.lastFormationAt,
    lastIntegratedAt,
    sources: {
      engagement: !!input.lastEngagementAt,
      formation: !!input.lastFormationAt,
    },
    needsFollowup: !!hasAssignee || !input.lastEngagementAt,
    followupReason: hasAssignee
      ? "FOLLOWUP_ASSIGNED"
      : !input.lastEngagementAt
        ? "no_engagement_yet"
        : undefined,
    assignedTo,
  };
}