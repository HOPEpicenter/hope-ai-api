import { WorkloadOptimizationController } from "../../src/api/workloadOptimization/workloadOptimization.controller";

describe("WorkloadOptimizationController", () => {
  it("returns deterministic defaults and computes plans from fusion input objects", () => {
    const controller = new WorkloadOptimizationController();
    expect(controller.getMember("missing")).toBeNull();
    expect(controller.getPastor("pastor-care")).toEqual([]);
    expect(controller.getLeadershipSummary()).toMatchObject({ totalMembers: 0, assignedCount: 0 });
    expect(controller.getLeadershipReport().schedule).toEqual([]);

    const plan = controller.createPlan({
      predictiveMemberIntelligence: [{
        risk: { memberId: "member-a", stallRiskScore: 0.1, careNeedScore: 0.9, disengagementRiskScore: 0, growthPotentialScore: 0, leadershipPotentialScore: 0, context: [] },
        priority: { memberId: "member-a", priority: "critical", priorityScore: 0.9, rationale: "Care" },
        insights: [], actions: []
      }],
      ministryHealthAnalytics: { overallScore: 100, status: "healthy", scoresByDomain: {}, alertCount: 0, trendCounts: {} }
    });
    expect(plan.schedule[0]).toMatchObject({ memberId: "member-a", pastorId: "pastor-care", priority: "medium" });
  });
});