import { generateGivingJourneyReport } from "../../src/domain/giving/giving.report";
import { buildGivingAnalytics } from "../../src/domain/giving/giving.analytics";
import { getGivingCoaching } from "../../src/domain/giving/giving.coaching";
import { buildGivingInsights } from "../../src/domain/giving/giving.insights";
import { buildGivingRecommendation } from "../../src/domain/giving/giving.intelligence";
import { buildGivingMilestones } from "../../src/domain/giving/giving.milestones";
import { createInitialGivingProfile } from "../../src/domain/giving/givingProfile.projection";
describe("Giving report", () => { it("returns an empty shaped report", () => { const profile = createInitialGivingProfile("m"); const insights = buildGivingInsights(profile); const milestones = buildGivingMilestones([]); expect(generateGivingJourneyReport({ profile, timeline: [], milestones, coaching: getGivingCoaching(profile, milestones, insights, buildGivingRecommendation(profile, insights)), analytics: buildGivingAnalytics([profile]) })).toMatchObject({ memberId: "m", giving: { gifts: 0 } }); }); });