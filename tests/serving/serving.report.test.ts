import { buildServingAnalytics } from "../../src/domain/serving/serving.analytics";
import { getServingCoaching } from "../../src/domain/serving/serving.coaching";
import { buildServingInsights } from "../../src/domain/serving/serving.insights";
import { buildServingRecommendation } from "../../src/domain/serving/serving.intelligence";
import { buildServingMilestones } from "../../src/domain/serving/serving.milestones";
import { applyServingEventToProfile, createInitialServingProfile } from "../../src/domain/serving/servingProfile.projection";
import { generateServingJourneyReport } from "../../src/domain/serving/serving.report";
import { createServingAssignmentStartedEvent } from "../../src/domain/serving/serving.events";
describe("Serving report", () => { it("returns a member journey report", () => { const profile = applyServingEventToProfile(createInitialServingProfile("member-1"), createServingAssignmentStartedEvent("member-1", "assignment-1", "role-1", "medium")); const insights = buildServingInsights(profile); const milestones = buildServingMilestones([]); const report = generateServingJourneyReport({ profile, timeline: [], milestones, coaching: getServingCoaching(profile, milestones, insights, buildServingRecommendation(profile, insights)), analytics: buildServingAnalytics([profile]) }); expect(report).toMatchObject({ memberId: "member-1", assignments: { started: 0, active: 1 } }); }); });