import { buildPredictiveMemberArrays, buildPredictiveMemberRisk } from "../../src/domain/predictiveIntelligence/predictive.riskEngine";

describe("predictive risk engine", () => {
  it("maps AI predictions to normalized explainable risk scores", () => {
    const risk = buildPredictiveMemberRisk({ memberId: "member-1", scores: { retentionRisk: 0.9, careNeed: 0.8, engagementLikelihood: 0.2, growthPotential: 0.8 }, riskClusters: ["risk"], strengthClusters: ["strength"], explainableFactors: [] }, { ministryHealthAnalytics: { overallScore: 60, status: "watch", scoresByDomain: {}, alertCount: 1, trendCounts: {} } });
    expect(risk).toEqual(expect.objectContaining({ memberId: "member-1" }));
    expect(Object.values(risk).filter((value) => typeof value === "number").every((score) => score >= 0 && score <= 1)).toBe(true);
    expect(risk.context).toContain("risk");
    expect(buildPredictiveMemberArrays([risk]).highRiskMembers).toHaveLength(1);
  });
});