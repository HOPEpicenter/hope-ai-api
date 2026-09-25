import { buildAiFeatureVector, createHealthyAiAnalyticsBundle } from "../../src/domain/aiModeling/ai.features";
import { buildAiInsights } from "../../src/domain/aiModeling/ai.insights";
import { buildAiPredictions } from "../../src/domain/aiModeling/ai.modeling";

describe("AI insights", () => {
  it("explains an elevated care signal", () => {
    const analytics = createHealthyAiAnalyticsBundle();
    analytics.careAnalytics = { ...analytics.careAnalytics, totalCases: 2, openCases: 2, highPriorityOpenCases: 2, unassignedOpenCases: 2, stalledCases: 2 };
    const features = buildAiFeatureVector("member-1", analytics);
    const insights = buildAiInsights(features, buildAiPredictions(features));
    expect(insights.some((insight) => insight.message.includes("Care"))).toBe(true);
    expect(insights.every((insight) => insight.memberId === "member-1")).toBe(true);
  });
});