import assert from "node:assert/strict";
import {
  redactDashboardPastoralRisk
} from "../../src/services/authorization/redactDashboardPastoralRisk";

function source() {
  return {
    visitorId: "visitor-1",
    displayName: "Test Person",

    assignedTo: "staff-plan-owner",
    assignedToName: "Plan Owner",
    stage: "connected",
    followupStatus: "action_needed",
    followupOverdue: true,
    needsFollowup: true,
    lastFollowupAssignedAt:
      "2026-09-20T00:00:00.000Z",

    attentionState: "needs_attention",
    followupUrgency: "AT_RISK",
    riskLevel: "high",
    riskScore: 100,
    recommendedAction:
      "Immediate pastoral followup recommended",
    priorityBand: "urgent",
    priorityScore: 100,
    priorityReason:
      "High Risk Needs Followup"
  };
}

async function run(): Promise<void> {
  {
    const input = source();

    const result =
      redactDashboardPastoralRisk(
        input,
        true
      );

    assert.equal(result, input);

    assert.equal(result.riskLevel, "high");
    assert.equal(result.riskScore, 100);
    assert.equal(
      result.priorityBand,
      "urgent"
    );
  }

  {
    const input = source();

    const result =
      redactDashboardPastoralRisk(
        input,
        false
      );

    assert.notEqual(result, input);

    assert.equal(result.riskLevel, null);
    assert.equal(result.riskScore, null);
    assert.equal(result.attentionState, null);
    assert.equal(result.followupUrgency, null);
    assert.equal(
      result.recommendedAction,
      null
    );
    assert.equal(result.priorityBand, null);
    assert.equal(result.priorityScore, null);
    assert.equal(result.priorityReason, null);

    /*
     * Legitimate operational data must remain.
     */
    assert.equal(
      result.visitorId,
      "visitor-1"
    );

    assert.equal(
      result.displayName,
      "Test Person"
    );

    assert.equal(
      result.assignedTo,
      "staff-plan-owner"
    );

    assert.equal(
      result.assignedToName,
      "Plan Owner"
    );

    assert.equal(
      result.stage,
      "connected"
    );

    assert.equal(
      result.followupStatus,
      "action_needed"
    );

    assert.equal(
      result.followupOverdue,
      true
    );

    assert.equal(
      result.needsFollowup,
      true
    );

    assert.equal(
      result.lastFollowupAssignedAt,
      "2026-09-20T00:00:00.000Z"
    );

    /*
     * Redaction must not mutate canonical data.
     */
    assert.equal(input.riskLevel, "high");
    assert.equal(
      input.priorityBand,
      "urgent"
    );
  }

  console.log(
    "dashboardPastoralRiskRedaction.test.ts passed"
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
