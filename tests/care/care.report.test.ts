import { buildCareAnalytics } from "../../src/domain/care/care.analytics";
import { getCareCoaching } from "../../src/domain/care/care.coaching";
import { buildCareInsights } from "../../src/domain/care/care.insights";
import { buildCareRecommendation } from "../../src/domain/care/care.intelligence";
import { buildCareMilestones } from "../../src/domain/care/care.milestones";
import { createInitialCareProfile } from "../../src/domain/care/careProfile.projection";
import { generateCareJourneyReport } from "../../src/domain/care/care.report";

describe("Care report", () => {
  it("returns an empty but shaped report", () => {
    const profile = createInitialCareProfile("unknown");
    const milestones = buildCareMilestones([]);
    const insights = buildCareInsights(profile);
    const coaching = getCareCoaching(profile, milestones, insights, buildCareRecommendation(profile, insights));
    expect(generateCareJourneyReport({ profile, timeline: [], milestones, coaching, analytics: buildCareAnalytics([]) })).toMatchObject({ memberId: "unknown", cases: { started: 0, closed: 0 } });
  });
});