import { MemberJourneyService } from "../../src/domain/memberJourney/memberJourney.service";

describe("member journey report", () => {
  it("includes ministry health context and all journey content", () => {
    const report = new MemberJourneyService().build({ memberId: "member-1", ministryHealthTimeline: [{ occurredAt: "2026-09-01T00:00:00.000Z", type: "score_observed", score: 75 }] }, "2026-09-02T00:00:00.000Z");
    expect(report.generatedAt).toBe("2026-09-02T00:00:00.000Z");
    expect(report.ministryHealthContext).toHaveLength(1);
    expect(report).toHaveProperty("recommendations");
  });
});