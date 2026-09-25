import { getServingCoaching } from "../../src/domain/serving/serving.coaching";
import { buildServingInsights } from "../../src/domain/serving/serving.insights";
import { buildServingRecommendation } from "../../src/domain/serving/serving.intelligence";
import { buildServingMilestones } from "../../src/domain/serving/serving.milestones";
import { applyServingEventToProfile, createInitialServingProfile } from "../../src/domain/serving/servingProfile.projection";
import { createServingAssignmentStartedEvent } from "../../src/domain/serving/serving.events";
describe("Serving coaching", () => { it("recommends a role for an unassigned assignment", () => { const profile = applyServingEventToProfile(createInitialServingProfile("member-1"), createServingAssignmentStartedEvent("member-1", "assignment-1", null, "medium")); const insights = buildServingInsights(profile); const coaching = getServingCoaching(profile, buildServingMilestones([]), insights, buildServingRecommendation(profile, insights)); expect(coaching).toMatchObject({ coachingPriority: "medium", recommendedNextStep: "An active serving assignment has no role." }); }); });