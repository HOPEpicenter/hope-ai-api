import { buildAiFeatureVector, createHealthyAiAnalyticsBundle } from "../../src/domain/aiModeling/ai.features";
import { buildAiInsights } from "../../src/domain/aiModeling/ai.insights";
import { buildAiPredictions } from "../../src/domain/aiModeling/ai.modeling";
import { buildAiRecommendations } from "../../src/domain/aiModeling/ai.recommendations";

describe("AI recommendations", () => {
  it("prioritizes a deterministic care follow-up", () => {
    const analytics = createHealthyAiAnalyticsBundle();
    analytics.careAnalytics = { ...analytics.careAnalytics, totalCases: 1, openCases: 1, highPriorityOpenCases: 1, unassignedOpenCases: 1, stalledCases: 1 };
    const features = buildAiFeatureVector("member-1", analytics);
    const predictions = buildAiPredictions(features);
    expect(buildAiRecommendations(predictions, buildAiInsights(features, predictions))[0]).toMatchObject({ action: "schedule_care_followup", priority: "high" });
  });
});