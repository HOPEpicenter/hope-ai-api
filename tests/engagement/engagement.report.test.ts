import { generateEngagementJourneyReport } from "../../src/domain/engagement/engagement.report";
import { buildEngagementAnalytics } from "../../src/domain/engagement/engagement.analytics";
import { getEngagementCoaching } from "../../src/domain/engagement/engagement.coaching";
import { buildEngagementInsights } from "../../src/domain/engagement/engagement.insights";
import { buildEngagementRecommendation } from "../../src/domain/engagement/engagement.intelligence";
import { buildEngagementMilestones } from "../../src/domain/engagement/engagement.milestones";
import { createInitialEngagementProfile } from "../../src/domain/engagement/engagementProfile.projection";
describe("engagement report", () => { it("reports a profile", () => { const profile = createInitialEngagementProfile("m"); const insights = buildEngagementInsights(profile); const milestones = buildEngagementMilestones([]); expect(generateEngagementJourneyReport({ profile, timeline: [], milestones, coaching: getEngagementCoaching(profile, milestones, insights, buildEngagementRecommendation(profile, insights)), analytics: buildEngagementAnalytics([]) }).memberId).toBe("m"); }); });