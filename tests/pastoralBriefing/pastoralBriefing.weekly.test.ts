import { buildWeeklyPastoralBriefing } from "../../src/domain/pastoralBriefing/pastoralBriefing.weekly";
import { pastoralBriefingFixture } from "./fixture";

describe("weekly pastoral briefing", () => {
  it("summarizes ministry focus, coaching themes, and workload distribution", () => {
    const briefing = buildWeeklyPastoralBriefing(pastoralBriefingFixture);
    expect(briefing.workloadDistribution).toMatchObject({ total: 1, urgent: 1, assigned: 1, byPastor: { "pastor-care": 1 } });
    expect(briefing.coachingThemes).toContain("A care case is stalled.");
  });

  it("passes insufficient-data guidance through to pastoral focus", () => {
    const response = "Review available records or connect personally before drawing a journey conclusion.";
    const briefing = buildWeeklyPastoralBriefing({
      ...pastoralBriefingFixture,
      memberJourneyNarrative: {
        ...pastoralBriefingFixture.memberJourneyNarrative,
        direction: "insufficient_data",
        pastoralResponse: response
      }
    });

    expect(briefing.pastoralFocus).toBe(response);
  });
});