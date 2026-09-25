import { buildPredictiveInsights } from "../../src/domain/predictiveIntelligence/predictive.insights";

describe("predictive insights", () => {
  it("explains risk, care, growth, and leadership thresholds", () => {
    const risk = { memberId: "member-1", stallRiskScore: 0.8, careNeedScore: 0.8, disengagementRiskScore: 0.8, growthPotentialScore: 0.8, leadershipPotentialScore: 0.8, context: ["source"] };
    const insights = buildPredictiveInsights(risk, { memberId: "member-1", priority: "critical", priorityScore: 0.8, rationale: "reason" });
    expect(insights.map((insight) => insight.type)).toEqual(["risk", "care", "growth", "leadership"]);
  });
});