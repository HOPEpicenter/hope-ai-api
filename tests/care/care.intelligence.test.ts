import { buildCareRecommendation } from "../../src/domain/care/care.intelligence";
import { buildCareInsights } from "../../src/domain/care/care.insights";
import { applyCareEventToProfile, createInitialCareProfile } from "../../src/domain/care/careProfile.projection";
import { createCareCaseStartedEvent, createCareStalledDetectedEvent } from "../../src/domain/care/care.events";

describe("Care intelligence", () => {
  it("prioritizes a stalled case", () => {
    const started = createCareCaseStartedEvent("member-1", "case-1", "owner-1", "medium");
    const profile = applyCareEventToProfile(applyCareEventToProfile(createInitialCareProfile("member-1"), started), createCareStalledDetectedEvent("member-1", "case-1", started.occurredAt));
    expect(buildCareRecommendation(profile, buildCareInsights(profile)).action).toBe("address_stalled_case");
  });
});