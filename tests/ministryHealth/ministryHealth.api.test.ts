import assert from "node:assert/strict";
import test from "node:test";
import { MinistryHealthController } from "../../src/api/ministryHealth/ministryHealth.controller";
import { buildMinistryHealthAggregate } from "../../src/domain/ministryHealth/ministryHealth.aggregate";
import { buildMinistryHealthAnalytics } from "../../src/domain/ministryHealth/ministryHealth.analytics";

const zeroEvidence = {
  formationAnalytics: { totalPathwaysStarted: 0, pathwayCompletionRate: 0, stalledPathwayCount: 0 },
  careAnalytics: { totalCases: 0, closureRate: 0, stalledCases: 0 },
  servingAnalytics: { totalAssignments: 0, closureRate: 0, stalledAssignments: 0 },
  communityAnalytics: { totalEngagements: 0, completionRate: 0, stalledEngagements: 0 },
  givingAnalytics: { totalGifts: 0, completionRate: 0 },
  attendanceAnalytics: { totalRecords: 0, attendanceRate: 0, stalledRecords: 0 },
  engagementAnalytics: { totalCycles: 0, completionRate: 0, stalledCycles: 0 }
};

test("empty Ministry Health is insufficient data", () => {
  const summary = new MinistryHealthController().getSummary();

  assert.equal(summary.status, "insufficient_data");
  assert.equal(summary.overallScore, null);
  assert.equal(summary.domainsAvailable, 0);
  assert.equal(summary.alertCount, 0);
});

test("zero-filled analytics are unavailable evidence", () => {
  const aggregate = buildMinistryHealthAggregate(zeroEvidence);

  assert.equal(aggregate.ministryHealthSummary.status, "insufficient_data");
  assert.equal(aggregate.ministryHealthSummary.overallScore, null);
  assert.equal(aggregate.ministryHealthSummary.domainsAvailable, 0);
  assert.equal(aggregate.ministryHealthSummary.alertCount, 0);
  assert.ok(aggregate.ministryHealthScores.every((score) => !score.available));
  assert.ok(
    aggregate.ministryHealthTrends.every(
      (trend) =>
        trend.direction === "insufficient_data" &&
        trend.value === null
    )
  );
  assert.equal(aggregate.ministryHealthAlerts.length, 0);
});

test("evidence-backed domains retain existing scoring", () => {
  const aggregate = buildMinistryHealthAggregate({
    ...zeroEvidence,
    careAnalytics: {
      totalCases: 2,
      closureRate: 1,
      stalledCases: 0
    },
    formationAnalytics: {
      totalPathwaysStarted: 1,
      pathwayCompletionRate: 0,
      stalledPathwayCount: 0
    }
  });

  const care = aggregate.ministryHealthScores.find(
    (score) => score.domain === "care"
  );
  const formation = aggregate.ministryHealthScores.find(
    (score) => score.domain === "formation"
  );

  assert.equal(care?.available, true);
  assert.equal(care?.score, 100);
  assert.equal(formation?.available, true);
  assert.equal(formation?.score, 0);
  assert.equal(aggregate.ministryHealthSummary.domainsAvailable, 2);
  assert.equal(aggregate.ministryHealthSummary.overallScore, 50);
});

test("unavailable domains produce no alerts", () => {
  const aggregate = buildMinistryHealthAggregate(zeroEvidence);
  assert.equal(aggregate.ministryHealthAlerts.length, 0);
});

test("analytics expose null scores when evidence is unavailable", () => {
  const analytics =
    buildMinistryHealthAnalytics(
      buildMinistryHealthAggregate(zeroEvidence)
    );

  assert.equal(analytics.overallScore, null);
  assert.equal(analytics.status, "insufficient_data");
  assert.ok(
    Object.values(analytics.scoresByDomain).every(
      (score) => score === null
    )
  );
  assert.equal(analytics.alertCount, 0);
  assert.equal(analytics.trendCounts.insufficient_data, 7);
});

test("refresh preserves generatedAt", () => {
  const controller = new MinistryHealthController();

  controller.refreshFromActivityIntelligence({
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...zeroEvidence
  } as any);

  assert.equal(
    controller.getReport().generatedAt,
    "2026-01-01T00:00:00.000Z"
  );
});