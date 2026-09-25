import { buildWeeklyPastoralBriefing } from "../../src/domain/pastoralBriefing/pastoralBriefing.weekly";
import { pastoralBriefingFixture } from "./fixture";

describe("weekly pastoral briefing", () => {
  it("summarizes ministry focus, coaching themes, and workload distribution", () => {
    const briefing = buildWeeklyPastoralBriefing(pastoralBriefingFixture);
    expect(briefing.workloadDistribution).toMatchObject({ total: 1, urgent: 1, assigned: 1, byPastor: { "pastor-care": 1 } });
    expect(briefing.coachingThemes).toContain("A care case is stalled.");
  });
});