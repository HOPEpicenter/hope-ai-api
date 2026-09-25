import { buildAiFeatureVector, createHealthyAiAnalyticsBundle } from "../../src/domain/aiModeling/ai.features";
import { buildAiPredictions } from "../../src/domain/aiModeling/ai.modeling";

describe("AI predictions", () => {
  it("keeps every weighted prediction score within zero and one", () => {
    const analytics = createHealthyAiAnalyticsBundle();
    analytics.attendanceAnalytics = { ...analytics.attendanceAnalytics, totalRecords: 3, attendanceRate: 0.1, stalledRecords: 2 };
    const predictions = buildAiPredictions(buildAiFeatureVector("member-1", analytics));
    expect(Object.values(predictions.scores).every((score) => score >= 0 && score <= 1)).toBe(true);
    expect(predictions.explainableFactors.length).toBeGreaterThan(0);
  });
});