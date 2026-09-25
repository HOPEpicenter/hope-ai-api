import { buildPastoralBriefingInputs } from "../../src/domain/pastoralBriefing/pastoralBriefing.inputs";
import { pastoralBriefingFixture } from "./fixture";

describe("pastoral briefing inputs", () => {
  it("retains all seven coaching arrays and deterministically normalizes recent events", () => {
    const input = buildPastoralBriefingInputs({ ...pastoralBriefingFixture, recentTimelineEvents: [...pastoralBriefingFixture.recentTimelineEvents].reverse() });
    expect(input.careCoaching).toHaveLength(1);
    expect(input.formationCoaching).toEqual([]);
    expect(input.recentTimelineEvents[0]?.memberId).toBe("member-risk");
  });
});