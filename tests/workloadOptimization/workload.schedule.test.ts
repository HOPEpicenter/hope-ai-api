import { schedulePastoralWorkload } from "../../src/domain/workloadOptimization/workload.schedule";

describe("schedulePastoralWorkload", () => {
  it("uses fixed actions, time windows, and horizons for each priority", () => {
    const schedule = schedulePastoralWorkload([
      { memberId: "urgent", pastorId: "pastor-a", priority: "urgent", primaryDriver: "care", loadImpact: 0.5, status: "assigned" },
      { memberId: "high", pastorId: "pastor-a", priority: "high", primaryDriver: "care", loadImpact: 1, status: "assigned" },
      { memberId: "medium", pastorId: "pastor-a", priority: "medium", primaryDriver: "growth", loadImpact: 1, status: "assigned" },
      { memberId: "low", pastorId: "pastor-a", priority: "low", primaryDriver: "leadership", loadImpact: 1, status: "assigned" }
    ]);

    expect(schedule.map(({ action, timeWindow, horizon }) => ({ action, timeWindow, horizon }))).toEqual([
      { action: "personal contact", timeWindow: "today", horizon: "immediate" },
      { action: "pastoral follow-up", timeWindow: "within 48 hours", horizon: "short-term" },
      { action: "planned check-in", timeWindow: "this week", horizon: "weekly" },
      { action: "monitor", timeWindow: "this month", horizon: "monthly" }
    ]);
  });
});