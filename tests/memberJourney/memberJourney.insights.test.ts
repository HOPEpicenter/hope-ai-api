import { buildMemberJourneyAggregate } from "../../src/domain/memberJourney/memberJourney.aggregate";
import { buildMemberJourneyInsights } from "../../src/domain/memberJourney/memberJourney.insights";

describe("member journey insights", () => {
  it("exposes every named insight array", () => {
    const insights = buildMemberJourneyInsights(buildMemberJourneyAggregate({ memberId: "member-1", ministryHealthTimeline: [{ occurredAt: "2026-09-01T00:00:00.000Z", type: "alert_raised", message: "Care health needs attention." }] }));
    expect(Object.values(insights).every(Array.isArray)).toBe(true);
    expect(insights.ministryHealthSignals).toHaveLength(1);
  });
});