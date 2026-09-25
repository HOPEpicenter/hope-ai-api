import { PastoralBriefingController } from "../../src/api/pastoralBriefing/pastoralBriefing.controller";

describe("PastoralBriefingController", () => {
  it("returns shaped deterministic defaults when no pipeline state is injected", () => {
    const controller = new PastoralBriefingController();
    expect(controller.getDaily()).toMatchObject({ urgency: { level: "normal" }, scriptureEncouragement: null });
    expect(controller.getWeekly().workloadDistribution.total).toBe(0);
    expect(controller.getEvents()).toEqual([]);
    expect(controller.getDailyReport().reportType).toBe("daily");
    expect(controller.getWeeklyReport().reportType).toBe("weekly");
    expect(controller.getEventsReport().reportType).toBe("events");
  });
});