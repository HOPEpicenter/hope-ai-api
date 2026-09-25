import { buildCareAlerts } from "../../src/domain/care/care.alerts";
import { buildCareInsights } from "../../src/domain/care/care.insights";
import { applyCareEventToProfile, createInitialCareProfile } from "../../src/domain/care/careProfile.projection";
import { createCareCaseStartedEvent } from "../../src/domain/care/care.events";

describe("Care alerts", () => {
  it("raises high priority and ownership alerts", () => {
    const profile = applyCareEventToProfile(createInitialCareProfile("member-1"), createCareCaseStartedEvent("member-1", "case-1", null, "high"));
    expect(buildCareAlerts(profile, buildCareInsights(profile)).map((alert) => alert.signalType)).toEqual(["HighPriorityCareCase", "UnassignedCareCase"]);
  });
});