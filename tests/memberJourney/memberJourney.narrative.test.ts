import { buildMemberJourneyAggregate } from "../../src/domain/memberJourney/memberJourney.aggregate";
import { buildMemberJourneyNarrative } from "../../src/domain/memberJourney/memberJourney.narrative";

describe("member journey narrative", () => {
  it("uses an attentive pastoral response for a risk moment", () => {
    const narrative = buildMemberJourneyNarrative(buildMemberJourneyAggregate({ memberId: "member-1", care: [{ memberId: "member-1", items: [{ occurredAt: "2026-09-01T00:00:00.000Z", type: "CareStalledDetected" }] }] }));
    expect(narrative).toMatchObject({ tone: "attentive", direction: "needs_attention" });
  });
});