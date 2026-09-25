import { buildPredictiveLeadershipIntelligence, buildPredictiveMemberIntelligence } from "../../src/domain/predictiveIntelligence/predictive.report";

describe("predictive leadership report", () => {
  it("combines member intelligence into global leadership arrays", () => {
    const analytics = { overallScore: 100, status: "healthy", scoresByDomain: {}, alertCount: 0, trendCounts: {} };
    const members = buildPredictiveMemberIntelligence([{ memberId: "member-1", scores: { retentionRisk: 0.1, careNeed: 0.1, engagementLikelihood: 0.9, growthPotential: 0.9 }, riskClusters: [], strengthClusters: ["strength"], explainableFactors: [] }], analytics);
    const leadership = buildPredictiveLeadershipIntelligence({ members, ministryHealthAnalytics: analytics });
    expect(leadership.summary.totalMembers).toBe(1);
    expect(leadership.summary.growthMembers).toHaveLength(1);
    expect(leadership.report.rankings[0]?.memberId).toBe("member-1");
  });
});