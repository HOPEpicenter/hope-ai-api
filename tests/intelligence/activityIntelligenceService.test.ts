import assert from "assert";
import { buildActivityIntelligence } from "../../src/services/intelligence/activityIntelligenceService";

const baseCare = {
  totalCandidates: 0,
  urgentCount: 0,
  staleCount: 0,
  escalationCount: 0,
  assignedCount: 0,
  unassignedCount: 0,
  ownedCount: 0,
  queueCount: 0
};

const baseFollowups = {
  total: 0,
  resolved: 0,
  escalated: 0,
  overdue: 0,
  atRisk: 0,
  onTrack: 0
};

{
  const result = buildActivityIntelligence({
    careSummary: baseCare,
    followupStats: baseFollowups,
    formationProfiles: [
      { stage: "Guest" },
      { stage: "Connected", lastNextStepAt: "2026-01-01T00:00:00.000Z" },
      {
        stage: "Connected",
        assignedTo: "ops-user-1",
        lastNextStepAt: "2026-01-01T00:00:00.000Z",
        lastNextStepCompletedAt: "2026-01-02T00:00:00.000Z",
        lastFollowupOutcome: "connected",
        lastFollowupOutcomeAt: "2026-01-03T00:00:00.000Z",
        groups: [{ groupId: "group-1" }]
      },
      { stage: "" },
      {}
    ],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.strictEqual(result.generatedAt, "2026-01-01T00:00:00.000Z");
  assert.strictEqual(result.operationalHealth.status, "healthy");
  assert.deepStrictEqual(result.operationalHealth.reasons, []);
  assert.strictEqual(result.formation.totalProfiles, 5);
  assert.strictEqual(result.formation.byStage.Guest, 1);
  assert.strictEqual(result.formation.byStage.Connected, 2);
  assert.strictEqual(result.formation.byStage.Unknown, 2);

  assert.strictEqual(result.formation.milestoneSignals.nextStepSelected, 2);
  assert.strictEqual(result.formation.milestoneSignals.nextStepCompleted, 1);
  assert.strictEqual(result.formation.milestoneSignals.connectedOutcomes, 1);
  assert.strictEqual(result.formation.milestoneSignals.activeCareRelationships, 1);
  assert.strictEqual(result.formation.milestoneSignals.groupParticipation, 1);

  assert.strictEqual(result.formation.projectedJourney.guest, 3);
  assert.strictEqual(result.formation.projectedJourney.connected, 2);
  assert.strictEqual(result.formation.projectedJourney.growing, 1);
  assert.strictEqual(result.formation.projectedJourney.serving, 1);
  assert.strictEqual(result.formation.projectedJourney.member, 0);
}

{
  const result = buildActivityIntelligence({
    careSummary: {
      ...baseCare,
      staleCount: 2
    },
    followupStats: {
      ...baseFollowups,
      atRisk: 1
    },
    formationProfiles: [],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.strictEqual(result.operationalHealth.status, "watch");
  assert.ok(result.operationalHealth.reasons.includes("2 stale care candidate(s)"));
  assert.ok(result.operationalHealth.reasons.includes("1 at-risk followup(s)"));
}

{
  const result = buildActivityIntelligence({
    careSummary: {
      ...baseCare,
      urgentCount: 1,
      escalationCount: 1
    },
    followupStats: {
      ...baseFollowups,
      overdue: 1
    },
    formationProfiles: [],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.strictEqual(result.operationalHealth.status, "attention");
  assert.ok(result.operationalHealth.reasons.includes("1 overdue followup(s)"));
  assert.ok(result.operationalHealth.reasons.includes("1 care escalation(s)"));
  assert.ok(result.operationalHealth.reasons.includes("1 urgent care candidate(s)"));
}

{
  const result = buildActivityIntelligence({
    careSummary: baseCare,
    followupStats: baseFollowups,
    formationProfiles: [
      {
        stage: "Connected",
        groupsJson: JSON.stringify([{ groupId: "group-json" }])
      },
      {
        stage: "Connected",
        groupsJson: "not-json"
      },
      {
        stage: "Connected",
        lastFollowupOutcome: "member_class",
        lastFollowupOutcomeAt: "2026-01-04T00:00:00.000Z"
      }
    ],
    generatedAt: "2026-01-01T00:00:00.000Z"
  });

  assert.strictEqual(result.formation.milestoneSignals.groupParticipation, 1);
  assert.strictEqual(result.formation.projectedJourney.growing, 1);
  assert.strictEqual(result.formation.projectedJourney.serving, 1);
  assert.strictEqual(result.formation.projectedJourney.member, 1);
}

console.log("activityIntelligenceService.test.ts passed");
