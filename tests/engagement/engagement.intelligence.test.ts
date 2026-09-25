import { buildEngagementRecommendation } from "../../src/domain/engagement/engagement.intelligence";
import { buildEngagementInsights } from "../../src/domain/engagement/engagement.insights";
import { createInitialEngagementProfile } from "../../src/domain/engagement/engagementProfile.projection";
describe("engagement intelligence", () => { it("recommends no action without data", () => { const profile = createInitialEngagementProfile("m"); expect(buildEngagementRecommendation(profile, buildEngagementInsights(profile)).action).toBe("no_recommendation"); }); });