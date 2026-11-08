import assert from "node:assert/strict";
import {
  planTokenCustodyAtomicReceipt,
} from "../../src/services/authorization/planTokenCustodyAtomicReceipt";
import {
  submitSyntheticCustodyAtomicReceipt,
  type SyntheticCustodyTransactionPort,
} from "../../src/repositories/tokenCustodyAtomicReceiptAdapter";

const input = {
  recordId: "synthetic-credential-1",
  etag: 'W/"synthetic-etag"',
  receiptId: "123e4567-e89b-42d3-a456-426614174000",
  snapshot: {
    recordId: "synthetic-credential-1",
    revision: 3,
    rotationRevision: 2,
    revocationRevision: 0,
    state: "active" as const,
    accessExpiresAtMs: 1000,
  },
  command: {
    action: "rotate" as const,
    expectedRevision: 3,
    expectedRotationRevision: 2,
    expectedRevocationRevision: 0,
    authorized: true,
    executionEnabled: true,
    nextAccessExpiresAtMs: 2000,
  },
};

const plan = planTokenCustodyAtomicReceipt(input);
assert.equal(plan.outcome, "proposed");

async function main(): Promise<void> {
  let count = 0;
  let calls = 0;

  const successPort: SyntheticCustodyTransactionPort = {
    async submitTransaction(actions) {
      calls++;
      assert.equal(actions.length, 2);
      assert.equal(actions[0].kind, "update");
      assert.equal(actions[1].kind, "create");
    },
  };

  async function test(
    name: string,
    run: () => Promise<void>,
  ): Promise<void> {
    await run();
    count++;
    console.log(`PASS ${name}`);
  }

  await test("default disabled denies without submitting", async () => {
    calls = 0;
    const result = await submitSyntheticCustodyAtomicReceipt(
      plan, successPort,
    );
    assert.equal(result.outcome, "denied");
    assert.equal(calls, 0);
  });

  await test("synthetic success submits once", async () => {
    calls = 0;
    const result = await submitSyntheticCustodyAtomicReceipt(
      plan, successPort, true,
    );
    assert.equal(result.outcome, "committed");
    assert.equal(calls, 1);
    assert.equal(result.executionPermitted, false);
    assert.equal(result.retryPermitted, false);
  });

  await test("disabled planner decision never submits", async () => {
    calls = 0;
    const deniedPlan = planTokenCustodyAtomicReceipt({
      ...input,
      command: { ...input.command, executionEnabled: false },
    });
    const result = await submitSyntheticCustodyAtomicReceipt(
      deniedPlan, successPort, true,
    );
    assert.equal(result.outcome, "denied");
    assert.equal(calls, 0);
  });

  await test("known 412 conflict denies without retry", async () => {
    let attempts = 0;
    const port: SyntheticCustodyTransactionPort = {
      async submitTransaction() {
        attempts++;
        throw { statusCode: 412 };
      },
    };
    const result = await submitSyntheticCustodyAtomicReceipt(
      plan, port, true,
    );
    assert.equal(result.outcome, "denied");
    assert.equal(attempts, 1);
    assert.equal(result.retryPermitted, false);
  });

  await test("known duplicate receipt conflict denies", async () => {
    let attempts = 0;
    const port: SyntheticCustodyTransactionPort = {
      async submitTransaction() {
        attempts++;
        throw { statusCode: 409 };
      },
    };
    const result = await submitSyntheticCustodyAtomicReceipt(
      plan, port, true,
    );
    assert.equal(result.outcome, "denied");
    assert.equal(attempts, 1);
  });

  await test("lost acknowledgement is uncertain", async () => {
    let attempts = 0;
    const port: SyntheticCustodyTransactionPort = {
      async submitTransaction() {
        attempts++;
        throw new Error("synthetic acknowledgement lost");
      },
    };
    const result = await submitSyntheticCustodyAtomicReceipt(
      plan, port, true,
    );
    assert.equal(result.outcome, "uncertain");
    assert.equal(attempts, 1);
    assert.equal(result.executionPermitted, false);
    assert.equal(result.retryPermitted, false);
  });

  await test("unexpected metadata field denies before submit", async () => {
    calls = 0;
    if (plan.outcome !== "proposed") throw Error("bad fixture");
    const mutated = {
      ...plan,
      actions: [
        {
          ...plan.actions[0],
          refreshToken: "synthetic-never-persist",
        },
        plan.actions[1],
      ],
    } as unknown as typeof plan;
    const result = await submitSyntheticCustodyAtomicReceipt(
      mutated, successPort, true,
    );
    assert.equal(result.outcome, "denied");
    assert.equal(calls, 0);
  });

  await test("cross-partition plan denies before submit", async () => {
    calls = 0;
    if (plan.outcome !== "proposed") throw Error("bad fixture");
    const mutated = {
      ...plan,
      actions: [
        plan.actions[0],
        { ...plan.actions[1], partitionKey: "other-partition" },
      ],
    } as unknown as typeof plan;
    const result = await submitSyntheticCustodyAtomicReceipt(
      mutated, successPort, true,
    );
    assert.equal(result.outcome, "denied");
    assert.equal(calls, 0);
  });

  assert.equal(count, 8);
  console.log("CUSTODY_TRANSACTION_ADAPTER_TESTS=8_OF_8_PASS");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
