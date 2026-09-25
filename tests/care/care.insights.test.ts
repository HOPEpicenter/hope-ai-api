import { buildCareInsights } from "../../src/domain/care/care.insights";
import { applyCareEventToProfile, createInitialCareProfile } from "../../src/domain/care/careProfile.projection";
import { createCareCaseStartedEvent } from "../../src/domain/care/care.events";

describe("Care insights", () => {
  it("flags an unassigned high priority case", () => {
    const profile = applyCareEventToProfile(createInitialCareProfile("member-1"), createCareCaseStartedEvent("member-1", "case-1", null, "high"));
    expect(buildCareInsights(profile)).toMatchObject({ unassignedOpenCaseCount: 1, highPriorityOpenCaseCount: 1, needsAttention: true });
  });
});