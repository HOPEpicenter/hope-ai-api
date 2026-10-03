import assert from "node:assert/strict";
import type {
  FunctionFormationProfileEntity
} from "../../src/functions/_shared/formation";
import {
  readCanonicalCareProjection
} from "../../src/services/care/readCanonicalCareProjection";
import type {
  CanonicalVisitorDashboardCard
} from "../../src/services/dashboard/canonicalDashboardContracts";

function card(
  visitorId: string,
  overrides: Partial<CanonicalVisitorDashboardCard> = {}
): CanonicalVisitorDashboardCard {
  return {
    visitorId,
    displayName: visitorId,
    lastActivityAt: "2026-09-01T00:00:00.000Z",
    lastActivitySummary: "Care ownership assigned",
    stage: "Guest",
    stageReason: "event:FOLLOWUP_ASSIGNED",
    stageUpdatedAt: "2026-09-01T00:00:00.000Z",
    stageUpdatedBy: "system",
    lastNextStep: null,
    lastNextStepAt: null,
    lastNextStepCompletedAt: null,
    lastFollowupAssignedAt: "2026-09-01T00:00:00.000Z",
    lastFollowupOutcome: null,
    lastFollowupOutcomeAt: null,
    lastPrayerRequestedAt: null,
    followupStatus: "action_needed",
    assignedTo: "staff-owner",
    assignedToName: "Owner",
    attentionState: "needs_attention",
    followupUrgency: "OVERDUE",
    followupOverdue: true,
    riskLevel: "normal",
    riskScore: 10,
    needsFollowup: true,
    followupResolved: false,
    recommendedAction: "Review follow-up",
    priorityBand: "normal",
    priorityScore: 10,
    priorityReason: "needs_followup",
    ...overrides
  };
}

async function main(): Promise<void> {
  const openProfile: FunctionFormationProfileEntity = {
    partitionKey: "VISITOR",
    rowKey: "visitor-open",
    visitorId: "visitor-open",
    assignedTo: "staff-owner",
    lastFollowupAssignedAt: "2026-09-01T00:00:00.000Z"
  };

  const terminalProfile: FunctionFormationProfileEntity = {
    partitionKey: "VISITOR",
    rowKey: "visitor-resolved",
    visitorId: "visitor-resolved",
    assignedTo: "staff-owner",
    lastFollowupAssignedAt: "2026-09-01T00:00:00.000Z",
    lastFollowupOutcome: "CONNECTED",
    lastFollowupOutcomeAt: "2026-09-02T00:00:00.000Z"
  };

  const unassignedProfile: FunctionFormationProfileEntity = {
    partitionKey: "VISITOR",
    rowKey: "visitor-unassigned",
    visitorId: "visitor-unassigned",
    assignedTo: null
  };

  const requestedIds: string[] = [];

  const result = await readCanonicalCareProjection({
    profiles: [
      openProfile,
      terminalProfile,
      unassignedProfile
    ],
    readDashboardCard: async (visitorId) => {
      requestedIds.push(visitorId);

      if (visitorId === "visitor-open") {
        return card(visitorId, {
          assignedTo: "staff-canonical",
          lastFollowupAssignedAt:
            "2026-09-03T00:00:00.000Z"
        });
      }

      return card(visitorId);
    }
  });

  assert.deepStrictEqual(
    requestedIds.sort(),
    [
      "visitor-open",
      "visitor-resolved",
      "visitor-unassigned"
    ]
  );

  assert.equal(result.count, 1);
  assert.equal(result.summary.totalCandidates, 1);
  assert.equal(result.summary.assignedCount, 1);
  assert.equal(result.summary.unassignedCount, 0);

  assert.equal(
    result.items[0]?.visitorId,
    "visitor-open"
  );

  assert.equal(
    result.items[0]?.assignedTo,
    "staff-canonical"
  );

  assert.equal(
    result.items[0]?.source.followupOutcome,
    "needs_care"
  );

  assert.equal(
    result.items[0]?.source.followupOutcomeAt,
    "2026-09-03T00:00:00.000Z"
  );

  console.log(
    "readCanonicalCareProjection.test.ts passed"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
