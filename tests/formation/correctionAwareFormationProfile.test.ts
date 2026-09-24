import assert from "node:assert/strict";
import {
  assertCorrectionReplayEventCount,
  CorrectionReplayUnavailableError,
  deriveFormationProfileFromEvents,
  hasNextStepCompletionCorrection,
  replaceFormationProfileAfterReplay,
  resolveCorrectionAwareFormationProfile,
  type FunctionFormationEventEntity,
  type FunctionFormationProfileEntity
} from "../../src/functions/_shared/formation";
import { NEXT_STEP_COMPLETION_CORRECTED } from "../../src/domain/formation/effectiveNextStepCompletionEvents";

const visitorId = "visitor-synthetic";

function event(
  id: string,
  type: string,
  occurredAt: string,
  data: Record<string, unknown>
): FunctionFormationEventEntity {
  return {
    partitionKey: visitorId,
    rowKey: `${occurredAt}__${id}`,
    visitorId,
    type,
    occurredAt,
    recordedAt: occurredAt,
    idempotencyKey: id,
    metadata: JSON.stringify({ data })
  };
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

const persistedSnapshot: FunctionFormationProfileEntity = {
  partitionKey: "VISITOR",
  rowKey: visitorId,
  visitorId,
  lastNextStep: "Salvation",
  lastNextStepAt: "2026-01-01T00:00:00.000Z",
  lastNextStepCompletedAt: "2026-01-03T00:00:00.000Z"
};

async function run(): Promise<void> {
  const unchanged = await resolveCorrectionAwareFormationProfile(
    persistedSnapshot,
    [selected, firstCompletion, secondCompletion]
  );
  assert.strictEqual(
    unchanged,
    persistedSnapshot,
    "reads without correction events retain the persisted snapshot"
  );

  const effective = await resolveCorrectionAwareFormationProfile(
    persistedSnapshot,
    [secondCompletion, correction, selected, firstCompletion]
  );
  assert.equal(effective.lastNextStep, "Salvation");
  assert.equal(
    effective.lastNextStepCompletedAt,
    undefined,
    "a failed snapshot replacement must not expose a superseded completion"
  );

  const replayed = await deriveFormationProfileFromEvents(visitorId, [
    selected,
    firstCompletion,
    secondCompletion,
    correction
  ]);
  assert.deepEqual(effective, replayed.profile);

  assert.doesNotThrow(() =>
    assertCorrectionReplayEventCount(visitorId, 10000)
  );
  assert.throws(
    () => assertCorrectionReplayEventCount(visitorId, 10001),
    (error: unknown) =>
      error instanceof CorrectionReplayUnavailableError &&
      error.code === "CORRECTION_REPLAY_UNAVAILABLE",
    "a corrected visitor beyond the replay boundary must be unavailable rather than replayed partially"
  );

  let profileWriteCalled = false;
  await assert.rejects(
    replaceFormationProfileAfterReplay(
      visitorId,
      10001,
      true,
      async () => {
        profileWriteCalled = true;
      }
    ),
    (error: unknown) => error instanceof CorrectionReplayUnavailableError
  );
  assert.equal(
    profileWriteCalled,
    false,
    "a capped corrected replay must fail before replacing the persisted profile"
  );

  await replaceFormationProfileAfterReplay(
    visitorId,
    10000,
    false,
    async () => {
      profileWriteCalled = true;
    }
  );
  assert.equal(
    profileWriteCalled,
    true,
    "normal histories retain existing replacement behavior"
  );

  let requestedPageSize: number | undefined;
  const noCorrectionTable = {
    listEntities: () => ({
      byPage: (options: { maxPageSize: number }) => {
        requestedPageSize = options.maxPageSize;
        return (async function* () {
          yield [];
        })();
      }
    })
  };
  assert.equal(
    await hasNextStepCompletionCorrection(noCorrectionTable as any, visitorId),
    false
  );
  assert.equal(
    requestedPageSize,
    1,
    "routine no-correction probes fetch at most one minimal event row"
  );

  console.log("correctionAwareFormationProfile.test.ts passed");
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
