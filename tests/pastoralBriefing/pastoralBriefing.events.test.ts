import { buildEventPastoralBriefings } from "../../src/domain/pastoralBriefing/pastoralBriefing.events";
import { pastoralBriefingFixture } from "./fixture";

describe("pastoral briefing events", () => {
  it("emits deterministic events for all five trigger categories", () => {
    const events = buildEventPastoralBriefings(pastoralBriefingFixture);
    expect(new Set(events.map((event) => event.category))).toEqual(new Set(["predictive_urgency", "workload_assignment", "journey_attention", "ministry_health_alert", "timeline_signal"]));
    expect(events.every((event) => event.summary && event.action)).toBe(true);
  });
});