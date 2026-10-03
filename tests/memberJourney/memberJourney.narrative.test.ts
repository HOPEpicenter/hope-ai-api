import { buildMemberJourneyAggregate } from "../../src/domain/memberJourney/memberJourney.aggregate";
import { buildMemberJourneyNarrative } from "../../src/domain/memberJourney/memberJourney.narrative";

describe("member journey narrative", () => {
  it("uses an insufficient-data direction when no journey or predictive evidence exists", () => {
    const narrative = buildMemberJourneyNarrative(buildMemberJourneyAggregate({ memberId: "member-1" }));

    expect(narrative).toMatchObject({
      direction: "insufficient_data",
      summary: "No journey evidence is currently available.",
      currentSeason: "There is not enough recorded evidence to describe a current season.",
      pastoralResponse: "Review available records or connect personally before drawing a journey conclusion."
    });
  });

  it("preserves a steady conclusion when non-directional timeline evidence exists", () => {
    const narrative = buildMemberJourneyNarrative(buildMemberJourneyAggregate({
      memberId: "member-1",
      care: [{ memberId: "member-1", items: [{ occurredAt: "2026-09-01T00:00:00.000Z", type: "CareNoteAdded" }] }]
    }));

    expect(narrative.direction).toBe("steady");
  });

  it("treats present zero-valued AI or predictive output as evidence", () => {
    const aiNarrative = buildMemberJourneyNarrative(buildMemberJourneyAggregate({
      memberId: "member-1",
      aiPredictions: [{
        memberId: "member-1",
        scores: { retentionRisk: 0, growthPotential: 0, careNeed: 0, engagementLikelihood: 0 },
        riskClusters: [],
        strengthClusters: [],
        explainableFactors: []
      }]
    }));
    const predictiveNarrative = buildMemberJourneyNarrative(buildMemberJourneyAggregate({
      memberId: "member-1",
      predictiveMemberIntelligence: [{
        risk: {
          memberId: "member-1",
          stallRiskScore: 0,
          careNeedScore: 0,
          disengagementRiskScore: 0,
          growthPotentialScore: 0,
          leadershipPotentialScore: 0,
          context: []
        },
        priority: { memberId: "member-1", priority: "low", priorityScore: 0, rationale: "No risk evidence." },
        insights: [],
        actions: []
      }]
    }));

    expect(aiNarrative.direction).toBe("steady");
    expect(predictiveNarrative.direction).toBe("steady");
  });

  it("preserves a growing conclusion when growth evidence exists", () => {
    const narrative = buildMemberJourneyNarrative(buildMemberJourneyAggregate({
      memberId: "member-1",
      formation: [{ memberId: "member-1", items: [{ occurredAt: "2026-09-01T00:00:00.000Z", type: "PathwayStarted" }] }]
    }));

    expect(narrative.direction).toBe("growing");
  });

  it("uses an attentive pastoral response for a risk moment", () => {
    const narrative = buildMemberJourneyNarrative(buildMemberJourneyAggregate({ memberId: "member-1", care: [{ memberId: "member-1", items: [{ occurredAt: "2026-09-01T00:00:00.000Z", type: "CareStalledDetected" }] }] }));
    expect(narrative).toMatchObject({ tone: "attentive", direction: "needs_attention" });
  });
});