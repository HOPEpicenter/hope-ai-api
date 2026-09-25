import { getCommunityCoaching } from "../../src/domain/community/community.coaching";
import { buildCommunityInsights } from "../../src/domain/community/community.insights";
import { buildCommunityRecommendation } from "../../src/domain/community/community.intelligence";
import { buildCommunityMilestones } from "../../src/domain/community/community.milestones";
import { createInitialCommunityProfile } from "../../src/domain/community/communityProfile.projection";
describe("Community coaching", () => { it("returns low priority coaching for an empty profile", () => { const profile = createInitialCommunityProfile("member-1"); const insights = buildCommunityInsights(profile); expect(getCommunityCoaching(profile, buildCommunityMilestones([]), insights, buildCommunityRecommendation(profile, insights)).coachingPriority).toBe("low"); }); });