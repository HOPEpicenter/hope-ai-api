import assert from "node:assert/strict";
import {
  NEXT_STEP_COMPLETION_CORRECTED,
  resolveEffectiveNextStepCompletionEvents,
  type EffectiveFormationEvent
} from "../../src/domain/formation/effectiveNextStepCompletionEvents";

type NextStepEvent = EffectiveFormationEvent & {
  metadata: string;
};

function event(
  id: string,
  type: string,
  occurredAt: string,
  data: Record<string, unknown>
): NextStepEvent {
  return {
    idempotencyKey: id,
    rowKey: `${occurredAt}__${id}`,
    occurredAt,
    type,
    metadata: JSON.stringify({ data })
  };
}

function replayNextStepProfile(events: readonly NextStepEvent[]) {
  return events.reduce(
    (profile, current) => {
      const data = JSON.parse(current.metadata).data;

      if (current.type === "NEXT_STEP_SELECTED") {
        return {
          lastNextStep: data.nextStep ?? profile.lastNextStep,
          lastNextStepCompletedAt: null
        };
      }

      if (current.type === "NEXT_STEP_COMPLETED") {
        return {
          lastNextStep: data.nextStep ?? profile.lastNextStep,
          lastNextStepCompletedAt: current.occurredAt
        };
      }

      return profile;
    },
    {
      lastNextStep: null as string | null,
      lastNextStepCompletedAt: null as string | null
    }
  );
}

const selected = event(
  "selected-1",
  "NEXT_STEP_SELECTED",
  "2026-01-01T00:00:00.000Z",
  { nextStep: "Salvation" }
);
const firstCompletion = event(
  "completed-1",
  "NEXT_STEP_COMPLETED",
  "2026-01-02T00:00:00.000Z",
  { nextStep: "Salvation" }
);
const secondCompletion = event(
  "completed-2",
  "NEXT_STEP_COMPLETED",
  "2026-01-03T00:00:00.000Z",
  { nextStep: "Salvation" }
);
const correction = event(
  "correction-1",
  NEXT_STEP_COMPLETION_CORRECTED,
  "2026-01-04T00:00:00.000Z",
  {
    targetEventIds: ["completed-1", "completed-2"],
    reason: "Accidental completion"
  }
);

const originalAuditHistory = [
  secondCompletion,
  correction,
  selected,
  firstCompletion
];
const resolved = resolveEffectiveNextStepCompletionEvents(originalAuditHistory);

assert.deepEqual(
  originalAuditHistory.map(item => item.idempotencyKey),
  ["completed-2", "correction-1", "selected-1", "completed-1"],
  "the resolver must not mutate audit history"
);
assert.equal(resolved.auditEvents.length, 4);
assert.deepEqual(resolved.correctedCompletionEventIds, [
  "completed-1",
  "completed-2"
]);
assert.deepEqual(
  resolved.effectiveEvents.map(item => item.idempotencyKey),
  ["selected-1"],
  "one correction atomically excludes both historic completions"
);

const reverseResolved = resolveEffectiveNextStepCompletionEvents(
  [...originalAuditHistory].reverse()
);
assert.deepEqual(
  replayNextStepProfile(resolved.effectiveEvents),
  replayNextStepProfile(reverseResolved.effectiveEvents),
  "replay must derive the same profile regardless of input order"
);
assert.deepEqual(replayNextStepProfile(resolved.effectiveEvents), {
  lastNextStep: "Salvation",
  lastNextStepCompletedAt: null
});

const invalidCorrection = event(
  "correction-invalid",
  NEXT_STEP_COMPLETION_CORRECTED,
  "2026-01-05T00:00:00.000Z",
  { targetEventIds: ["completed-1", "missing-completion"] }
);
const invalidResolved = resolveEffectiveNextStepCompletionEvents([
  selected,
  firstCompletion,
  invalidCorrection
]);

assert.deepEqual(invalidResolved.correctedCompletionEventIds, []);
assert.deepEqual(invalidResolved.ignoredCorrectionEventIds, [
  "correction-invalid"
]);
assert.equal(
  replayNextStepProfile(invalidResolved.effectiveEvents).lastNextStepCompletedAt,
  "2026-01-02T00:00:00.000Z"
);

const prematureCorrection = event(
  "correction-premature",
  NEXT_STEP_COMPLETION_CORRECTED,
  "2026-01-01T12:00:00.000Z",
  { targetEventIds: ["completed-1"] }
);
const prematureResolved = resolveEffectiveNextStepCompletionEvents([
  selected,
  prematureCorrection,
  firstCompletion
]);

assert.deepEqual(prematureResolved.correctedCompletionEventIds, []);
assert.deepEqual(prematureResolved.ignoredCorrectionEventIds, [
  "correction-premature"
]);
assert.equal(
  replayNextStepProfile(prematureResolved.effectiveEvents).lastNextStepCompletedAt,
  "2026-01-02T00:00:00.000Z"
);

console.log("effectiveNextStepCompletionEvents.test.ts passed");
