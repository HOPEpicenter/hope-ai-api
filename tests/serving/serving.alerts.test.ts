import { buildServingAlerts } from "../../src/domain/serving/serving.alerts";
import { buildServingInsights } from "../../src/domain/serving/serving.insights";
import { applyServingEventToProfile, createInitialServingProfile } from "../../src/domain/serving/servingProfile.projection";
import { createServingAssignmentStartedEvent } from "../../src/domain/serving/serving.events";
describe("Serving alerts", () => { it("emits a high-priority assignment alert", () => { const profile = applyServingEventToProfile(createInitialServingProfile("member-1"), createServingAssignmentStartedEvent("member-1", "assignment-1", "role-1", "high")); expect(buildServingAlerts(profile, buildServingInsights(profile))[0]?.signalType).toBe("HighPriorityServingAssignment"); }); });