import { getEngagementCoaching } from "../../src/domain/engagement/engagement.coaching";
import { buildEngagementInsights } from "../../src/domain/engagement/engagement.insights";
import { buildEngagementRecommendation } from "../../src/domain/engagement/engagement.intelligence";
import { buildEngagementMilestones } from "../../src/domain/engagement/engagement.milestones";
import { createInitialEngagementProfile } from "../../src/domain/engagement/engagementProfile.projection";
describe("engagement coaching", () => { it("has low priority without signals", () => { const profile = createInitialEngagementProfile("m"); const insights = buildEngagementInsights(profile); expect(getEngagementCoaching(profile, buildEngagementMilestones([]), insights, buildEngagementRecommendation(profile, insights)).coachingPriority).toBe("low"); }); });