import { buildCareAnalytics } from "../../src/domain/care/care.analytics";
import { applyCareEventToProfile, createInitialCareProfile } from "../../src/domain/care/careProfile.projection";
import { createCareCaseStartedEvent, createCareCaseClosedEvent } from "../../src/domain/care/care.events";

describe("Care analytics", () => {
  it("summarizes closed cases", () => {
    const started = createCareCaseStartedEvent("member-1", "case-1", "owner-1", "low");
    const profile = applyCareEventToProfile(applyCareEventToProfile(createInitialCareProfile("member-1"), started), createCareCaseClosedEvent("member-1", "case-1"));
    expect(buildCareAnalytics([profile])).toMatchObject({ totalCases: 1, closedCases: 1, closureRate: 1 });
  });
});