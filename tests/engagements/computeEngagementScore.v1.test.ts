import assert from "node:assert/strict";
import {
  computeEngagementScoreV1
} from "../../src/domain/engagement/computeEngagementScore.v1";

const nowIso = "2026-09-29T00:00:00Z";

// Brand-new visitor: zero events ever recorded (not just zero in-window).
{
  const result = computeEngagementScoreV1({ events: [], windowDays: 14, nowIso });

  assert.equal(result.engagementCount, 0);
  assert.equal(result.hasPriorHistory, false);
  assert.equal(result.needsFollowup, false, "absence of any history must not imply followup is needed");
  assert.equal(result.score, 0);
}

// Visitor with genuine engagement history that is now outside the scoring window (stale).
{
  const result = computeEngagementScoreV1({
    events: [
      { visitorId: "visitor-stale", type: "note.add", occurredAt: "2026-08-01T00:00:00Z" } as any
    ],
    windowDays: 14,
    nowIso
  });

  assert.equal(result.engagementCount, 0, "event is outside the 14-day window");
  assert.equal(result.hasPriorHistory, true, "a real signal exists in the raw timeline");
  assert.equal(result.needsFollowup, true, "prior engagement gone quiet is real evidence, not absence of evidence");
}

// Visitor with recent genuine engagement inside the window.
{
  const result = computeEngagementScoreV1({
    events: [
      { visitorId: "visitor-recent", type: "note.add", occurredAt: "2026-09-28T00:00:00Z" } as any
    ],
    windowDays: 14,
    nowIso
  });

  assert.equal(result.engagementCount, 1);
  assert.equal(result.hasPriorHistory, true);
  assert.equal(result.engaged, true);
  assert.equal(result.needsFollowup, false);
}

console.log("computeEngagementScore.v1.test.ts passed");
