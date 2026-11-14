import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";

import {
  PhaseCOperationCredentialConsumptionRepository
} from "../../src/repositories/phaseCOperationCredentialConsumptionRepository";

function makeTable() {
  const rows = new Set<string>();
  let failure: number | null = null;
  let transactions = 0;

  const table = {
    async submitTransaction(actions: unknown[]) {
      transactions += 1;

      if (failure !== null) {
        throw { statusCode: failure };
      }

      const keys: string[] = [];

      for (const action of actions) {
        assert.ok(Array.isArray(action));
        assert.equal(action[0], "create");

        const entity = action[1] as {
          partitionKey: string;
          rowKey: string;
          state: string;
        };

        assert.equal(
          entity.partitionKey,
          "phase-c-credential-use-v1"
        );
        assert.equal(entity.state, "CLAIMED_UNAUTHORIZED");

        keys.push(
          `${entity.partitionKey}/${entity.rowKey}`
        );
      }

      if (keys.length !== 3 ||
          new Set(keys).size !== 3 ||
          keys.some(key => rows.has(key))) {
        throw { statusCode: 409 };
      }

      // Synthetic atomic all-or-none transaction.
      keys.forEach(key => rows.add(key));
    }
  } as unknown as TableClient;

  return {
    table,
    rows,
    get transactions() { return transactions; },
    fail(status: number | null) { failure = status; }
  };
}

function claim() {
  return {
    credentialId: randomUUID(),
    operationId: randomUUID(),
    requestId: randomUUID(),
    expiresUtc: Math.floor(Date.now() / 1000) + 120
  };
}

async function main(): Promise<void> {
  {
    const fake = makeTable();
    const repo =
      new PhaseCOperationCredentialConsumptionRepository(
        fake.table
      );

    const item = claim();
    const first = await repo.claim(item);

    assert.deepEqual(first, {
      status: "claimed",
      executionAuthorized: false,
      retryAuthorized: false
    });

    assert.equal(fake.rows.size, 3);
    assert.equal((await repo.claim(item)).status, "conflict");
    assert.equal(fake.rows.size, 3);

    console.log("PASS=ATOMIC_CLAIM_AND_REPLAY_DENIAL");
  }

  {
    const fake = makeTable();
    const repo =
      new PhaseCOperationCredentialConsumptionRepository(
        fake.table
      );

    const item = claim();

    const outcomes = await Promise.all([
      repo.claim(item),
      repo.claim(item)
    ]);

    assert.deepEqual(
      outcomes.map(x => x.status).sort(),
      ["claimed", "conflict"]
    );

    assert.equal(fake.rows.size, 3);
    assert.ok(
      outcomes.every(x => !x.executionAuthorized)
    );

    console.log("PASS=CONCURRENT_CLAIM_SINGLE_WINNER");
  }

  {
    const fake = makeTable();
    const repo =
      new PhaseCOperationCredentialConsumptionRepository(
        fake.table
      );

    const original = claim();

    assert.equal(
      (await repo.claim(original)).status,
      "claimed"
    );

    assert.equal(
      (await repo.claim({
        ...original,
        credentialId: randomUUID()
      })).status,
      "conflict"
    );

    assert.equal(
      (await repo.claim({
        ...original,
        operationId: randomUUID(),
        requestId: randomUUID()
      })).status,
      "conflict"
    );

    assert.equal(fake.rows.size, 3);

    console.log("PASS=OPERATION_AND_CREDENTIAL_REUSE_DENIED");
  }

  {
    const fake = makeTable();
    const repo =
      new PhaseCOperationCredentialConsumptionRepository(
        fake.table
      );

    const item = claim();

    for (const invalid of [
      null,
      {},
      { ...item, expiresUtc: 0 },
      { ...item, expiresUtc: item.expiresUtc + 9999 },
      { ...item, credentialId: "invalid" },
      { ...item, requestId: item.operationId },
      { ...item, verified: true }
    ]) {
      assert.equal(
        (await repo.claim(invalid)).status,
        "invalid"
      );
    }

    assert.equal(fake.transactions, 0);

    console.log("PASS=INVALID_AND_EXPIRED_DENIED");
  }

  {
    const fake = makeTable();
    const repo =
      new PhaseCOperationCredentialConsumptionRepository(
        fake.table
      );

    fake.fail(503);

    assert.deepEqual(await repo.claim(claim()), {
      status: "uncertain",
      executionAuthorized: false,
      retryAuthorized: false
    });

    console.log("PASS=UNCERTAIN_STORAGE_DENIED");
  }

  console.log("PHASE_C_CREDENTIAL_CONSUMPTION_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
