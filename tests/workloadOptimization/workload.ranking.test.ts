import { rankPastoralWorkload } from "../../src/domain/workloadOptimization/workload.ranking";

describe("rankPastoralWorkload", () => {
  it("ranks deterministically and exposes the strongest driver words", () => {
    const rankings = rankPastoralWorkload([
      { memberId: "member-b", priorityScore: 0.8, careNeedScore: 0.2, stallRiskScore: 0.9, growthPotentialScore: 0, leadershipPotentialScore: 0, pastoralComplexityScore: 0 },
      { memberId: "member-a", priorityScore: 0.8, careNeedScore: 0.9, stallRiskScore: 0.1, growthPotentialScore: 0, leadershipPotentialScore: 0, pastoralComplexityScore: 0 }
    ]);

    expect(rankings.map((item) => item.memberId)).toEqual(["member-a", "member-b"]);
    expect(rankings[0]).toMatchObject({ priority: "urgent", primaryDriver: "care" });
    expect(rankings[1]!.driverWords).toContain("stall");
  });
});