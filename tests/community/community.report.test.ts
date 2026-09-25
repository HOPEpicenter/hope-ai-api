import { buildCommunityAnalytics } from "../../src/domain/community/community.analytics";
import { getCommunityCoaching } from "../../src/domain/community/community.coaching";
import { buildCommunityInsights } from "../../src/domain/community/community.insights";
import { buildCommunityRecommendation } from "../../src/domain/community/community.intelligence";
import { buildCommunityMilestones } from "../../src/domain/community/community.milestones";
import { createInitialCommunityProfile } from "../../src/domain/community/communityProfile.projection";
import { generateCommunityJourneyReport } from "../../src/domain/community/community.report";
describe("Community report", () => { it("returns an empty engagement report", () => { const profile = createInitialCommunityProfile("member-1"); const insights = buildCommunityInsights(profile); const milestones = buildCommunityMilestones([]); const report = generateCommunityJourneyReport({ profile, timeline: [], milestones, coaching: getCommunityCoaching(profile, milestones, insights, buildCommunityRecommendation(profile, insights)), analytics: buildCommunityAnalytics([]) }); expect(report.engagements.started).toBe(0); }); });