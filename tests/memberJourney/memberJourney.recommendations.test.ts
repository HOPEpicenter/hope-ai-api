import { buildMemberJourneyAggregate } from "../../src/domain/memberJourney/memberJourney.aggregate";
import { buildMemberJourneyRecommendations } from "../../src/domain/memberJourney/memberJourney.recommendations";

describe("member journey recommendations", () => {
  it("prioritizes critical domain coaching", () => {
    const recommendations = buildMemberJourneyRecommendations(buildMemberJourneyAggregate({ memberId: "member-1", care: [{ memberId: "member-1", items: [{ occurredAt: "2026-09-01T00:00:00.000Z", type: "CareStalledDetected", severity: "critical" }] }] }));
    expect(recommendations[0]).toMatchObject({ priority: "urgent", source: "domain" });
  });
});