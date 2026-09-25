import { getCareCoaching } from "../../src/domain/care/care.coaching";
import { buildCareInsights } from "../../src/domain/care/care.insights";
import { buildCareRecommendation } from "../../src/domain/care/care.intelligence";
import { buildCareMilestones } from "../../src/domain/care/care.milestones";
import { applyCareEventToProfile, createInitialCareProfile } from "../../src/domain/care/careProfile.projection";
import { createCareCaseStartedEvent } from "../../src/domain/care/care.events";

describe("Care coaching", () => {
  it("sets a medium priority for an unassigned case", () => {
    const profile = applyCareEventToProfile(createInitialCareProfile("member-1"), createCareCaseStartedEvent("member-1", "case-1", null, "low"));
    const insights = buildCareInsights(profile);
    expect(getCareCoaching(profile, buildCareMilestones([]), insights, buildCareRecommendation(profile, insights)).coachingPriority).toBe("medium");
  });
});