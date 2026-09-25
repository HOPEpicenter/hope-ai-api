import { buildGivingRecommendation } from "../../src/domain/giving/giving.intelligence";
import { buildGivingInsights } from "../../src/domain/giving/giving.insights";
import { createInitialGivingProfile } from "../../src/domain/giving/givingProfile.projection";
describe("Giving intelligence", () => { it("recommends generosity when no gifts exist", () => { const profile = createInitialGivingProfile("m"); expect(buildGivingRecommendation(profile, buildGivingInsights(profile)).action).toBe("encourage_generosity"); }); });