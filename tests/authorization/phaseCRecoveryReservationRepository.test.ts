import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import {
  PhaseCRecoveryReservationRepository
} from "../../src/repositories/phaseCRecoveryReservationRepository";

type Row = {
  partitionKey: string;
  rowKey: string;
};

function makeTable() {
  const rows = new Set<string>();
  let failStatus: number | null = null;

  const table = {
    async submitTransaction(actions: unknown[]) {
      if (failStatus !== null) {
        throw { statusCode: failStatus };
      }

      const keys: string[] = [];

      for (const action of actions) {
        assert.ok(Array.isArray(action));
        assert.equal(action[0], "create");

        const row = action[1] as Row;
        assert.equal(row.partitionKey, "phase-c-recovery-v1");

        keys.push(`${row.partitionKey}/${row.rowKey}`);
      }

      if (keys.length !== 2 ||
          new Set(keys).size !== 2 ||
          keys.some(key => rows.has(key))) {
        throw { statusCode: 409 };
      }

      // Simulate one atomic all-or-none transaction.
      keys.forEach(key => rows.add(key));
    }
  } as unknown as TableClient;

  return {
    table,
    rows,
    fail(status: number | null) {
      failStatus = status;
    }
  };
}

function request() {
  return {
    operationId: randomUUID(),
    requestId: randomUUID(),
    createdUtc: 100
  };
}

async function main() {
  {
    const fake = makeTable();
    const repo = new PhaseCRecoveryReservationRepository(fake.table);
    const item = request();

    assert.deepEqual(await repo.reserve(item), {
      status: "reserved",
      executionAuthorized: false,
      retryAuthorized: false
    });

    assert.equal(fake.rows.size, 2);
    assert.equal((await repo.reserve(item)).status, "conflict");
    assert.equal(fake.rows.size, 2);

    console.log("PASS=ATOMIC_RESERVATION_AND_DUPLICATE");
  }

  {
    const fake = makeTable();
    const repo = new PhaseCRecoveryReservationRepository(fake.table);
    const first = request();

    assert.equal((await repo.reserve(first)).status, "reserved");

    assert.equal(
      (await repo.reserve({
        ...request(),
        operationId: first.operationId
      })).status,
      "conflict"
    );

    assert.equal(
      (await repo.reserve({
        ...request(),
        requestId: first.requestId
      })).status,
      "conflict"
    );

    assert.equal(fake.rows.size, 2);
    console.log("PASS=GLOBAL_ID_UNIQUENESS");
  }

  {
    const fake = makeTable();
    const repo = new PhaseCRecoveryReservationRepository(fake.table);
    const item = request();

    const outcomes = await Promise.all([
      repo.reserve(item),
      repo.reserve(item)
    ]);

    assert.deepEqual(
      outcomes.map(x => x.status).sort(),
      ["conflict", "reserved"]
    );

    assert.equal(fake.rows.size, 2);
    console.log("PASS=CONCURRENT_SINGLE_WINNER");
  }

  {
    const fake = makeTable();
    const repo = new PhaseCRecoveryReservationRepository(fake.table);

    fake.fail(503);

    assert.deepEqual(await repo.reserve(request()), {
      status: "uncertain",
      executionAuthorized: false,
      retryAuthorized: false
    });

    assert.equal(fake.rows.size, 0);
    console.log("PASS=UNCERTAIN_FAILURE_DENIED");
  }

  {
    const fake = makeTable();
    const repo = new PhaseCRecoveryReservationRepository(fake.table);

    const malformed = {
      ...request(),
      createdUtc: -1
    };

    assert.equal((await repo.reserve(malformed)).status, "invalid");
    assert.equal(fake.rows.size, 0);
    console.log("PASS=INVALID_REQUEST_DENIED");
  }

  console.log("PHASE_C_RESERVATION_REGRESSIONS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
