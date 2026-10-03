import { buildEventPastoralBriefings } from "../../src/domain/pastoralBriefing/pastoralBriefing.events";
import { pastoralBriefingFixture } from "./fixture";

describe("pastoral briefing events", () => {
  it("emits deterministic events for all five trigger categories", () => {
    const events = buildEventPastoralBriefings(pastoralBriefingFixture);
    expect(new Set(events.map((event) => event.category))).toEqual(new Set(["predictive_urgency", "workload_assignment", "journey_attention", "ministry_health_alert", "timeline_signal"]));
    expect(events.every((event) => event.summary && event.action)).toBe(true);
  });

  it.each(["insufficient_data", "healthy"] as const)(
    "does not emit a Ministry Health alert for %s",
    (status) => {
      const events = buildEventPastoralBriefings({
        ...pastoralBriefingFixture,
        predictiveMemberIntelligence: [],
        workloadMemberPlans: [],
        ministryHealthSummary: {
          status,
          overallScore: null,
          alertCount: 0
        }
      });

      expect(events.some((event) => event.category === "ministry_health_alert")).toBe(false);
    }
  );

  it.each(["watch", "attention"] as const)(
    "emits a Ministry Health alert for %s",
    (status) => {
      const events = buildEventPastoralBriefings({
        ...pastoralBriefingFixture,
        ministryHealthSummary: {
          status,
          overallScore: 52,
          alertCount: 1
        }
      });

      expect(events.some((event) => event.category === "ministry_health_alert")).toBe(true);
    }
  );
});