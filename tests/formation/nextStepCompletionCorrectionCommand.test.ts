import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import {
  CorrectionCommandError,
  recordNextStepCompletionCorrection,
  type CorrectionInput
} from "../../src/services/formation/recordNextStepCompletionCorrection";
import { postNextStepCompletionCorrection } from "../../src/functions/postNextStepCompletionCorrection";
import {
  NEXT_STEP_COMPLETION_CORRECTED,
  resolveEffectiveNextStepCompletionEvents
} from "../../src/domain/formation/effectiveNextStepCompletionEvents";
import { CorrectionReplayUnavailableError } from "../../src/functions/_shared/formation";
import { validateFormationEventEnvelopeV1Strict } from "../../src/contracts/formationEventEnvelope.v1";

const visitorId = "visitor-synthetic";
const completed = (id: string) => ({
  partitionKey: visitorId,
  rowKey: "2026-01-01T00:00:00.000Z__" + id,
  visitorId,
  type: "NEXT_STEP_COMPLETED",
  occurredAt: "2026-01-01T00:00:00.000Z",
  recordedAt: "2026-01-01T00:00:00.000Z",
  idempotencyKey: id,
  metadata: JSON.stringify({ data: { nextStep: "Salvation" } })
});

class FakeTable {
  rows = new Map<string, any>();
  transactions = 0;
  constructor(initial: any[]) {
    for (const row of initial) this.rows.set(row.rowKey, row);
  }
  async createTable() {}
  async getEntity(_partition: string, key: string): Promise<any> {
    const row = this.rows.get(key);
    if (!row) throw { statusCode: 404 };
    return row;
  }
  listEntities() {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        for (const row of self.rows.values()) yield row;
      }
    };
  }
  async submitTransaction(actions: any[]): Promise<void> {
    // Emulate Azure's all-or-nothing create transaction in one partition.
    await Promise.resolve();
    const keys = actions.map((action: any) => action[1].rowKey);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(actions.every((action: any) =>
      action[0] === "create" && action[1].partitionKey === visitorId
    ));
    if (keys.some((key: string) => this.rows.has(key))) throw { statusCode: 409 };
    for (const action of actions) this.rows.set(action[1].rowKey, action[1]);
    this.transactions++;
  }
}
const asTable = (fake: FakeTable) => fake as unknown as TableClient;
const input = (eventId: string, targets: string[]): CorrectionInput => ({
  visitorId,
  eventId,
  targetEventIds: targets,
  reason: "Recorded in error; decision has not been confirmed",
  actorId: "staff-synthetic"
});
const conflict = (error: unknown) =>
  error instanceof CorrectionCommandError && error.statusCode === 409;

async function run(): Promise<void> {
  const table = new FakeTable([completed("one"), completed("two")]);
  const first = await recordNextStepCompletionCorrection(input("correction-a", ["one", "two"]), asTable(table));
  assert.equal(first.accepted, true);
  assert.equal(table.transactions, 1);
  const correctionEvents = [...table.rows.values()].filter(row => row.type === NEXT_STEP_COMPLETION_CORRECTED);
  assert.equal(correctionEvents.length, 1);
  const resolved = resolveEffectiveNextStepCompletionEvents(
    [...table.rows.values()].filter(row => row.type)
  );
  assert.deepEqual(resolved.correctedCompletionEventIds, ["one", "two"]);
  assert.equal(resolved.effectiveEvents.filter(e => e.type === "NEXT_STEP_COMPLETED").length, 0);
  const replay = await recordNextStepCompletionCorrection(
    input("correction-a", ["two", "one"]), asTable(table)
  );
  assert.equal(replay.accepted, false);
  assert.equal(table.transactions, 1);
  await assert.rejects(
    recordNextStepCompletionCorrection(input("correction-b", ["one"]), asTable(table)),
    conflict
  );
  await assert.rejects(
    recordNextStepCompletionCorrection({ ...input("correction-a", ["one"]), reason: "changed" }, asTable(table)),
    conflict
  );
  await assert.rejects(
    recordNextStepCompletionCorrection(input("correction-invalid", ["two", "missing"]), asTable(table)),
    conflict
  );
  assert.equal(table.transactions, 1);

  const concurrent = new FakeTable([completed("one"), completed("two")]);
  const results = await Promise.allSettled([
    recordNextStepCompletionCorrection(input("concurrent-a", ["one"]), asTable(concurrent)),
    recordNextStepCompletionCorrection(input("concurrent-b", ["one"]), asTable(concurrent))
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected" && conflict(result.reason)).length, 1);
  assert.equal(concurrent.transactions, 1);

  const large = new FakeTable(Array.from({ length: 10001 }, (_, i) => ({
    partitionKey: visitorId,
    rowKey: "2026-01-01T00:00:00.000Z__event-" + i,
    visitorId,
    type: "NEXT_STEP_SELECTED",
    occurredAt: "2026-01-01T00:00:00.000Z",
    recordedAt: "2026-01-01T00:00:00.000Z",
    idempotencyKey: "event-" + i
  })));
  await assert.rejects(
    recordNextStepCompletionCorrection(input("too-many", ["one"]), asTable(large)),
    (error: unknown) => error instanceof CorrectionReplayUnavailableError
  );
  assert.equal(large.transactions, 0);

  assert.throws(
    () => validateFormationEventEnvelopeV1Strict({
      v: 1,
      visitorId,
      eventId: "generic-attempt",
      type: NEXT_STEP_COMPLETION_CORRECTED,
      occurredAt: "2026-01-02T00:00:00.000Z",
      source: { system: "api" },
      data: { targetEventIds: ["one"], reason: "wrong route" }
    }),
    /audited next-step completion correction command/
  );

  const previous = process.env.FEATURE_NEXT_STEP_COMPLETION_CORRECTIONS;
  try {
    delete process.env.FEATURE_NEXT_STEP_COMPLETION_CORRECTIONS;
    const context: any = {};
    await postNextStepCompletionCorrection(context, { body: input("disabled", ["one"]) });
    assert.equal(context.res.status, 404);
  } finally {
    if (previous === undefined) delete process.env.FEATURE_NEXT_STEP_COMPLETION_CORRECTIONS;
    else process.env.FEATURE_NEXT_STEP_COMPLETION_CORRECTIONS = previous;
  }

  console.log("nextStepCompletionCorrectionCommand.test.ts passed");
}
void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
