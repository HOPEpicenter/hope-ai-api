import { buildAiFeatureVector, createHealthyAiAnalyticsBundle } from "../../src/domain/aiModeling/ai.features";

describe("AI feature vectors", () => {
	it("normalizes scores and surfaces cross-domain signals", () => {
		const analytics = createHealthyAiAnalyticsBundle();
		analytics.formationAnalytics = { ...analytics.formationAnalytics, totalPathwaysStarted: 4, totalPathwaysCompleted: 1, stallRate: 0.5 };
		analytics.careAnalytics = { ...analytics.careAnalytics, totalCases: 2, openCases: 2, stalledCases: 1, highPriorityOpenCases: 1, unassignedOpenCases: 1 };
		analytics.attendanceAnalytics = { ...analytics.attendanceAnalytics, totalRecords: 4, attendedCount: 4, attendanceRate: 1 };
		analytics.ministryHealthAnalytics = { ...analytics.ministryHealthAnalytics, overallScore: 75, alertCount: 2 };
		const result = buildAiFeatureVector("member-1", analytics);
		expect(result.memberId).toBe("member-1");
		expect(Object.values(result.scores).every((score) => score >= 0 && score <= 1)).toBe(true);
		expect(result.stallRiskIndicators.length).toBeGreaterThanOrEqual(2);
		expect(result.riskClusters.some((cluster) => cluster.startsWith("Cross-domain"))).toBe(true);
		expect(result.growthIndicators).toContain("Attendance is sustaining connection.");
	});
});