import { MemberJourneyController } from "../../src/api/memberJourney/memberJourney.controller";

describe("member journey API controller", () => {
  it("returns shaped outputs for an unknown member", () => {
    const controller = new MemberJourneyController();
    expect(controller.getJourney("unknown").memberId).toBe("unknown");
    expect(controller.getSummary("unknown").memberId).toBe("unknown");
    expect(controller.getInsights("unknown")).toHaveProperty("strengths");
    expect(controller.getRecommendations("unknown")).toHaveLength(1);
    expect(controller.getReport("unknown")).toHaveProperty("ministryHealthContext");
  });
});