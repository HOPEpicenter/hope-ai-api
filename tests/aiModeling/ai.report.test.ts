import { createHealthyAiAnalyticsBundle } from "../../src/domain/aiModeling/ai.features";
import { buildAiMemberReport } from "../../src/domain/aiModeling/ai.report";

describe("AI member report", () => {
  it("returns the complete deterministic report shape", () => {
    const report = buildAiMemberReport("member-1", createHealthyAiAnalyticsBundle());
    expect(report).toEqual(expect.objectContaining({ memberId: "member-1", features: expect.any(Object), predictions: expect.any(Object), insights: expect.any(Array), recommendations: expect.any(Array) }));
  });
});