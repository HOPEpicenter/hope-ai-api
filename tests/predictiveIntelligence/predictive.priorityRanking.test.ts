import { rankPredictiveMembers, rankPredictivePriority } from "../../src/domain/predictiveIntelligence/predictive.priorityRanking";

const highRisk = { memberId: "member-1", stallRiskScore: 0.9, careNeedScore: 0.1, disengagementRiskScore: 0.2, growthPotentialScore: 0.1, leadershipPotentialScore: 0.1, context: [] };

describe("predictive priority ranking", () => {
  it("prioritizes critical risk before lower scores", () => {
    expect(rankPredictivePriority(highRisk).priority).toBe("critical");
    expect(rankPredictiveMembers([{ ...highRisk, memberId: "member-2", stallRiskScore: 0.2 }, highRisk]).map((item) => item.memberId)).toEqual(["member-1", "member-2"]);
  });
});