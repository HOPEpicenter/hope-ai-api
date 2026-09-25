import { buildMemberJourneyAggregate } from "../../src/domain/memberJourney/memberJourney.aggregate";

describe("member journey aggregate", () => {
  it("normalizes and deterministically orders domain events", () => {
    const aggregate = buildMemberJourneyAggregate({ memberId: "member-1", care: [{ memberId: "member-1", items: [{ occurredAt: "2026-09-02T00:00:00.000Z", type: "CareCaseClosed" }] }], formation: [{ memberId: "member-1", items: [{ occurredAt: "2026-09-01T00:00:00.000Z", type: "PathwayStarted" }, { occurredAt: "2026-09-03T00:00:00.000Z", type: "StepStalledDetected" }] }] });
    expect(aggregate.timeline.map((event) => event.eventType)).toEqual(["PathwayStarted", "CareCaseClosed", "StepStalledDetected"]);
    expect(aggregate.recoveryMoments).toHaveLength(1);
    expect(aggregate.riskMoments).toHaveLength(1);
  });
});