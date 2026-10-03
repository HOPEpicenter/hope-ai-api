import { buildMinistryHealthAggregate } from "../../src/domain/ministryHealth/ministryHealth.aggregate";
import { buildMinistryHealthTimeline } from "../../src/domain/ministryHealth/ministryHealth.timeline";

test("emits scores only for available domains and preserves available zero scores and alerts", () => {
  const timeline = buildMinistryHealthTimeline(buildMinistryHealthAggregate({
    careAnalytics: { totalCases: 1, stalledCases: 0, closureRate: 0 }
  }, "2026-01-01T00:00:00.000Z"));

  expect(timeline.some((item) => item.domain === "giving" && item.type === "score_observed")).toBe(false);
  expect(timeline).toContainEqual({
    occurredAt: "2026-01-01T00:00:00.000Z",
    domain: "care",
    type: "score_observed",
    score: 0
  });
  expect(timeline.some((item) => item.domain === "care" && item.type === "alert_raised")).toBe(true);
});