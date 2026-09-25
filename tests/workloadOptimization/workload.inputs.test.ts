import assert from "node:assert/strict";
import { buildPastoralWorkloadInput } from "../../src/domain/workloadOptimization/workload.inputs";

test("buildPastoralWorkloadInput produces bounded fused scores", () => {
const result = buildPastoralWorkloadInput("member-1", {
  predictiveMemberIntelligence: [{
    risk: {
      memberId: "member-1",
      stallRiskScore: 0.8,
      careNeedScore: 0.7,
      disengagementRiskScore: 0.6,
      growthPotentialScore: 0.5,
      leadershipPotentialScore: 0.4,
      context: []
    },
    priority: { memberId: "member-1", priority: "high", priorityScore: 0.8, rationale: "Risk" },
    insights: [],
    actions: []
  }],
  memberJourneySummary: { memberId: "member-1", tone: "concerned" },
  careCoaching: [{ memberId: "member-1", coachingPriority: "high", concerns: ["Stalled"] }],
  formationCoaching: [{ memberId: "member-1", coachingPriority: "medium" }],
  ministryHealthAnalytics: { overallScore: 60, status: "watch", scoresByDomain: {}, alertCount: 1, trendCounts: {} }
});

assert.ok(result);
assert.equal(result.memberId, "member-1");
assert.ok(result.priorityScore > 0.5);
assert.ok(result.pastoralComplexityScore > 0);
for (const value of Object.values(result).filter((value): value is number => typeof value === "number")) {
  assert.ok(value >= 0 && value <= 1);
}

});