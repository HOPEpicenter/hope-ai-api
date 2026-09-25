import { buildPredictiveActions } from "../../src/domain/predictiveIntelligence/predictive.actions";

describe("predictive actions", () => {
  it("uses exact deterministic intervention horizons", () => {
    const actions = buildPredictiveActions({ memberId: "member-1", stallRiskScore: 0.9, careNeedScore: 0.8, disengagementRiskScore: 0.8, growthPotentialScore: 0.8, leadershipPotentialScore: 0.8, context: [] }, { memberId: "member-1", priority: "critical", priorityScore: 0.9, rationale: "risk" });
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "pastoral_outreach", horizon: "within_24_hours" }),
      expect.objectContaining({ action: "growth_next_step", horizon: "within_30_days" }),
      expect.objectContaining({ action: "leadership_discernment", horizon: "within_30_days" })
    ]));
  });
});