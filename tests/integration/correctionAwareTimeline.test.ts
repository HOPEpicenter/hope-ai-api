import assert from "node:assert/strict";
import { toCorrectionAwareFormationTimelineItems } from "../../src/services/integration/integrationService";
import { NEXT_STEP_COMPLETION_CORRECTED } from "../../src/domain/formation/effectiveNextStepCompletionEvents";

function event(
  id: string,
  type: string,
  occurredAt: string,
  data: Record<string, unknown>
) {
  return {
    idempotencyKey: id,
    rowKey: `${occurredAt}__${id}`,
    visitorId: "visitor-synthetic",
    type,
    occurredAt,
    metadata: JSON.stringify({ data })
  };
}

const completion = event(
  "completed-1",
  "NEXT_STEP_COMPLETED",
  "2026-01-01T00:00:00.000Z",
  { nextStep: "Salvation" }
);
const correction = event(
  "correction-1",
  NEXT_STEP_COMPLETION_CORRECTED,
  "2026-01-02T00:00:00.000Z",
  { targetEventIds: ["completed-1"] }
);

const completeHistory = toCorrectionAwareFormationTimelineItems(
  "visitor-synthetic",
  [completion],
  [completion, correction]
);

assert.equal(
  completeHistory.length,
  1,
  "the requested timeline window must not expand when correction context is older or newer than the window"
);
assert.equal(completeHistory[0].eventId, completion.rowKey);
assert.equal(
  completeHistory[0].effective,
  false,
  "a displayed completion is labeled from complete history even when its correction is outside the displayed window"
);

const unavailable = toCorrectionAwareFormationTimelineItems(
  "visitor-synthetic",
  [completion],
  [completion],
  true
);

assert.equal(unavailable[0].effective, null);
assert.equal(unavailable[0].correctionReplayUnavailable, true);

console.log("correctionAwareTimeline.test.ts passed");
