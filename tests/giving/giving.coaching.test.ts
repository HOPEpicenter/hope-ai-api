import { getGivingCoaching } from "../../src/domain/giving/giving.coaching";
import { buildGivingInsights } from "../../src/domain/giving/giving.insights";
import { buildGivingRecommendation } from "../../src/domain/giving/giving.intelligence";
import { buildGivingMilestones } from "../../src/domain/giving/giving.milestones";
import { createInitialGivingProfile } from "../../src/domain/giving/givingProfile.projection";
describe("Giving coaching", () => { it("uses low priority for an empty profile", () => { const profile = createInitialGivingProfile("m"); const insights = buildGivingInsights(profile); expect(getGivingCoaching(profile, buildGivingMilestones([]), insights, buildGivingRecommendation(profile, insights)).coachingPriority).toBe("low"); }); });