import assert from "node:assert/strict";
import {
  computeEngagementScoreV1
} from "../../src/domain/engagement/computeEngagementScore.v1";
import {
  deriveEngagementRiskV1
} from "../../src/domain/engagement/deriveEngagementRisk.v1";
import {
  deriveFollowupPriority
} from "../../src/services/followups/deriveFollowupPriority";

const nowIso = "2026-09-29T00:00:00Z";

/**
 * TEST 2 — New visitor with an authoritative assigned follow-up (FOLLOWUP_ASSIGNED),
 * but zero engagement events. This mirrors the /ops/followups queue derivation
 * (buildOpsFollowupsQueue.ts), where an open assignment is itself ministry evidence
 * even when the engagement timeline has no signals yet. This is a regression guard
 * for the existing assert-ops-followups.ps1 contract and must not be weakened.
 */
{
  const score = computeEngagementScoreV1({ events: [], windowDays: 14, nowIso });

  const queueNeedsFollowup = true; // authoritative: assignedAt exists, not resolved (deriveQueueSignals)

  const risk = deriveEngagementRiskV1({
    visitorId: "visitor-assigned",
    windowDays: 14,
    engaged: score.engaged,
    lastEngagedAt: score.lastEngagedAt,
    daysSinceLastEngagement: score.daysSinceLastEngagement,
    engagementCount: score.engagementCount,
    hasPriorHistory: score.hasPriorHistory || queueNeedsFollowup,
    score: score.score,
    scoreReasons: score.scoreReasons,
    needsFollowup: score.needsFollowup
  });

  assert.equal(risk.riskLevel, "high", "assigned-but-uncontacted followup must remain high risk");
  assert.ok(risk.riskScore >= 60, "risk score must remain in the high band");

  const priority = deriveFollowupPriority({
    needsFollowup: queueNeedsFollowup,
    riskLevel: risk.riskLevel,
    riskScore: risk.riskScore
  });

  assert.equal(priority.priorityBand, "urgent", "priorityBand must remain urgent per assert-ops-followups contract");
  assert.equal(priority.priorityReason, "high_risk_needs_followup");
}

console.log("opsFollowupsEngagementRiskEvidence.test.ts passed");
