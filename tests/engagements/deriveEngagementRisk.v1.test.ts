import assert from "node:assert/strict";
import {
  computeEngagementScoreV1
} from "../../src/domain/engagement/computeEngagementScore.v1";
import {
  deriveEngagementRiskV1
} from "../../src/domain/engagement/deriveEngagementRisk.v1";

const nowIso = "2026-09-29T00:00:00Z";

// TEST 1 / TEST 6 — completely empty new visitor: zero engagement events, no prior history.
// Absence of evidence must not be scored as High/100/needs-followup.
{
  const score = computeEngagementScoreV1({ events: [], windowDays: 14, nowIso });

  const risk = deriveEngagementRiskV1({
    visitorId: "visitor-empty",
    windowDays: 14,
    engaged: score.engaged,
    lastEngagedAt: score.lastEngagedAt,
    daysSinceLastEngagement: score.daysSinceLastEngagement,
    engagementCount: score.engagementCount,
    hasPriorHistory: score.hasPriorHistory,
    score: score.score,
    scoreReasons: score.scoreReasons,
    needsFollowup: score.needsFollowup
  });

  assert.notEqual(risk.riskLevel, "high", "riskLevel must NOT be high merely because history is empty");
  assert.notEqual(risk.riskScore, 100, "riskScore must NOT be 100 merely because history is empty");
  assert.equal(risk.riskLevel, "low");
  assert.equal(risk.riskScore, 0);
  assert.equal(risk.engagement.needsFollowup, false);
  assert.notEqual(
    risk.recommendedAction,
    "Immediate pastoral followup recommended",
    "recommendedAction must not fabricate urgency from empty history"
  );
}

// TEST 3 — recent genuine engagement remains low-risk/non-urgent (unchanged behavior).
{
  const score = computeEngagementScoreV1({
    events: [
      { visitorId: "visitor-recent", type: "note.add", occurredAt: "2026-09-28T00:00:00Z" } as any
    ],
    windowDays: 14,
    nowIso
  });

  const risk = deriveEngagementRiskV1({
    visitorId: "visitor-recent",
    windowDays: 14,
    engaged: score.engaged,
    lastEngagedAt: score.lastEngagedAt,
    daysSinceLastEngagement: score.daysSinceLastEngagement,
    engagementCount: score.engagementCount,
    hasPriorHistory: score.hasPriorHistory,
    score: score.score,
    scoreReasons: score.scoreReasons,
    needsFollowup: score.needsFollowup
  });

  assert.equal(risk.riskLevel, "low");
  assert.notEqual(risk.riskLevel, "high");
  assert.equal(risk.engagement.needsFollowup, false);
}

// Regression guard: genuine stale disengagement (real prior signal, now outside window)
// must still be visible as risk — this PR must not weaken legitimate high-risk detection.
{
  const score = computeEngagementScoreV1({
    events: [
      { visitorId: "visitor-stale", type: "note.add", occurredAt: "2026-08-01T00:00:00Z" } as any
    ],
    windowDays: 14,
    nowIso
  });

  const risk = deriveEngagementRiskV1({
    visitorId: "visitor-stale",
    windowDays: 14,
    engaged: score.engaged,
    lastEngagedAt: score.lastEngagedAt,
    daysSinceLastEngagement: score.daysSinceLastEngagement,
    engagementCount: score.engagementCount,
    hasPriorHistory: score.hasPriorHistory,
    score: score.score,
    scoreReasons: score.scoreReasons,
    needsFollowup: score.needsFollowup
  });

  assert.equal(risk.riskLevel, "high", "real prior engagement gone quiet remains legitimate high risk");
  assert.equal(risk.riskScore, 100);
  assert.equal(risk.engagement.needsFollowup, true);
}

console.log("deriveEngagementRisk.v1.test.ts passed");
