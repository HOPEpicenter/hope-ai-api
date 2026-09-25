import { buildDailyPastoralBriefing } from "../../src/domain/pastoralBriefing/pastoralBriefing.daily";
import { pastoralBriefingFixture } from "./fixture";

describe("daily pastoral briefing", () => {
  it("combines predictive and workload urgency with no more than two actions", () => {
    const briefing = buildDailyPastoralBriefing(pastoralBriefingFixture);
    expect(briefing.urgency).toMatchObject({ level: "urgent", memberIds: ["member-risk"] });
    expect(briefing.trendSnapshot.direction).toBe("declining");
    expect(briefing.actions).toHaveLength(1);
    expect(briefing.scriptureEncouragement).toBeNull();
  });
});