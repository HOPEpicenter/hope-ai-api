import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  createPermanentVisitorQrReservationStore as createStore
} from "../src/repositories/permanentVisitorQrReservationStore";

import {
  reservePermanentVisitorQrAdmission as reserve,
  type ReservationRow
} from "../src/services/visitors/reservePermanentVisitorQrAdmission";

import {
  issuePermanentVisitorQrGrant as issue,
  type PermanentQrGrantContext
} from "../src/services/visitors/permanentVisitorQrGrant";

function rows(
  grantId = randomUUID(),
  submissionId = randomUUID(),
  slotKey = "slot__29933280__000"
): ReservationRow[] {
  const base = {
    partitionKey: "pv1_" + "a".repeat(64),
    grantId,
    submissionId,
    claimHash: "b".repeat(64),
    slotKey
  };

  return [
    { ...base, rowKey: `grant__${grantId}` },
    { ...base, rowKey: `submission__${submissionId}` },
    { ...base, rowKey: slotKey }
  ];
}

test("invalid transaction scope never reaches SDK", async () => {
  let calls = 0;

  const store = createStore({
    getEntity: async () => null,
    submitTransaction: async () => {
      calls++;
      throw new Error("SDK must not be called");
    }
  });

  const valid = rows();

  await assert.rejects(store.createAll(valid.slice(0, 2)));

  await assert.rejects(store.createAll([
    valid[0],
    valid[1],
    { ...valid[2], partitionKey: "wrong-partition" }
  ]));

  await assert.rejects(store.createAll([
    valid[0], valid[0], valid[2]
  ]));

  assert.equal(calls, 0);
});

test("unknown SDK errors and incomplete responses fail closed", async () => {
  const store = createStore({
    getEntity: async () => {
      throw { statusCode: 403, code: "AuthorizationFailure" };
    },
    submitTransaction: async () => ({
      status: 202,
      subResponses: [{ status: 204 }]
    })
  });

  await assert.rejects(store.read("p", "r"));
  await assert.rejects(store.createAll(rows()));

  const unknownConflict = createStore({
    getEntity: async () => null,
    submitTransaction: async () => {
      throw { statusCode: 409, code: "UnknownConflict" };
    }
  });

  await assert.rejects(unknownConflict.createAll(rows()));
});

test("only recognized storage absence and conflict are classified", async () => {
  const store = createStore({
    getEntity: async () => {
      throw { statusCode: 404, code: "ResourceNotFound" };
    },
    submitTransaction: async () => {
      throw { statusCode: 409, code: "EntityAlreadyExists" };
    }
  });

  assert.equal(await store.read("p", "r"), null);
  assert.equal(await store.createAll(rows()), "conflict");

  const missingTable = createStore({
    getEntity: async () => {
      throw { statusCode: 404, code: "TableNotFound" };
    },
    submitTransaction: async () => {
      throw new Error("unexpected");
    }
  });

  await assert.rejects(missingTable.read("p", "r"));
});

test("nested SDK missing-entity and conflict codes are recognized", async () => {
  const store = createStore({
    getEntity: async () => {
      throw {
        statusCode: 404,
        details: {
          errorCode: "ResourceNotFound",
          odataError: {
            code: "ResourceNotFound"
          }
        }
      };
    },

    submitTransaction: async () => {
      throw {
        statusCode: 409,
        details: {
          errorCode: "EntityAlreadyExists",
          odataError: {
            code: "EntityAlreadyExists"
          }
        }
      };
    }
  });

  assert.equal(await store.read("p", "r"), null);
  assert.equal(await store.createAll(rows()), "conflict");
});

test("unknown missing-table and contradictory codes remain failures", async () => {
  const errors = [
    {
      statusCode: 404
    },
    {
      statusCode: 404,
      details: {
        errorCode: "TableNotFound"
      }
    },
    {
      statusCode: 404,
      code: "ResourceNotFound",
      details: {
        errorCode: "AuthorizationFailure"
      }
    },
    {
      statusCode: 403,
      details: {
        errorCode: "ResourceNotFound"
      }
    }
  ];

  for (const error of errors) {
    const store = createStore({
      getEntity: async () => {
        throw error;
      },

      submitTransaction: async () => {
        throw new Error("unexpected transaction");
      }
    });

    await assert.rejects(store.read("p", "r"));
  }

  const conflictingCodes = createStore({
    getEntity: async () => null,

    submitTransaction: async () => {
      throw {
        statusCode: 409,
        code: "EntityAlreadyExists",
        details: {
          errorCode: "UnknownConflict"
        }
      };
    }
  });

  await assert.rejects(
    conflictingCodes.createAll(rows())
  );
});


test("adapters sharing one SDK client serialize transactions", async () => {
  let calls = 0;
  let active = 0;
  let maxActive = 0;

  let releaseFirst!: () => void;
  let markStarted!: () => void;

  const firstStarted = new Promise<void>(resolve => {
    markStarted = resolve;
  });

  const firstGate = new Promise<void>(resolve => {
    releaseFirst = resolve;
  });

  const client = {
    getEntity: async () => null,

    submitTransaction: async () => {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);

      try {
        if (calls === 1) {
          markStarted();
          await firstGate;
        }

        return {
          status: 202,
          subResponses: [
            { status: 204 },
            { status: 204 },
            { status: 204 }
          ]
        };
      } finally {
        active--;
      }
    }
  };

  const firstStore = createStore(client);
  const secondStore = createStore(client);

  const first = firstStore.createAll(rows());

  await firstStarted;

  const second = secondStore.createAll(rows());

  await new Promise<void>(
    resolve => setImmediate(resolve)
  );

  const callsWhileFirstActive = calls;

  releaseFirst();

  assert.deepEqual(
    await Promise.all([first, second]),
    ["created", "created"]
  );

  assert.equal(callsWhileFirstActive, 1);
  assert.equal(maxActive, 1);
  assert.equal(calls, 2);
});

test("failed transaction releases queue for subsequent work", async () => {
  let calls = 0;

  const client = {
    getEntity: async () => null,

    submitTransaction: async () => {
      calls++;

      if (calls === 1) {
        throw new Error("synthetic transaction failure");
      }

      return {
        status: 202,
        subResponses: [
          { status: 204 },
          { status: 204 },
          { status: 204 }
        ]
      };
    }
  };

  const firstStore = createStore(client);
  const secondStore = createStore(client);

  const results = await Promise.allSettled([
    firstStore.createAll(rows()),
    secondStore.createAll(rows())
  ]);

  assert.equal(results[0].status, "rejected");
  assert.deepEqual(results[1], {
    status: "fulfilled",
    value: "created"
  });

  assert.equal(calls, 2);
});


test("local Azurite verifies durable atomic reservation behavior", {
  skip: process.env.HOPE_VISITOR_57_LOCAL_ACCEPTANCE !== "true",
  timeout: 120000
}, async t => {
  // Explicit local emulator only.
  // No application environment connection string is read.
  const tableName = "HopeVisitor57" +
    randomUUID().replace(/-/g, "");

  const client = TableClient.fromConnectionString(
    "UseDevelopmentStorage=true",
    tableName
  );

  const endpoint = new URL(client.url);

  assert.equal(endpoint.protocol, "http:");
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert.equal(endpoint.port, "10002");
  assert.equal(
    endpoint.pathname.replace(/\/$/, ""),
    "/devstoreaccount1"
  );

  await client.createTable();

  try {
    const store = createStore(client);

    await t.test("real transaction commits all three rows", async () => {
      const entities = rows();

      assert.equal(
        await store.read(
          entities[0].partitionKey,
          entities[0].rowKey
        ),
        null
      );

      assert.equal(
        await store.createAll(entities),
        "created"
      );

      for (const row of entities) {
        assert.deepEqual(
          await store.read(row.partitionKey, row.rowKey),
          row
        );
      }

      assert.equal(
        await store.createAll(entities),
        "conflict"
      );
    });

    await t.test("duplicate capacity slot rolls back both new claims", async () => {
      const competing = rows();

      assert.equal(
        await store.createAll(competing),
        "conflict"
      );

      for (const row of competing.slice(0, 2)) {
        assert.equal(
          await store.read(row.partitionKey, row.rowKey),
          null
        );
      }
    });

    await t.test("real reservation service supports exact durable retry", async () => {
      const signingSecret =
        "synthetic-local-qr-signing-secret-only";

      const claimSecret =
        "synthetic-local-claim-binding-secret-only";

      const event = {
        id: "synthetic-local-service",
        date: "2026-11-29",
        name: "Synthetic Local Service",
        active: true
      };

      const context: PermanentQrGrantContext = {
        enabled: true,
        selectedEventId: event.id,
        approvedEvents: [event],
        nowMs: Date.parse("2026-11-29T15:00:00Z"),
        policy: {
          enabled: true,
          ownerActivated: true,
          eventId: event.id,
          date: event.date,
          opensAtMs: Date.parse("2026-11-29T14:00:00Z"),
          closesAtMs: Date.parse("2026-11-29T18:00:00Z")
        }
      };

      const token = issue(signingSecret, context);
      assert.ok(token);

      const command = {
        submissionId: randomUUID(),
        serviceId: event.id,
        name: "Synthetic Local Visitor",
        email: "synthetic@example.invalid"
      };

      const deps = {
        enabled: true,
        signingSecret,
        claimSecret,
        context,
        capacity: 1,
        store
      };

      const input = { token, command };

      assert.deepEqual(await reserve(input, deps), {
        admitted: true,
        status: "reserved"
      });

      // Fresh adapter over the same durable local table.
      const reopened = createStore(
        TableClient.fromConnectionString(
          "UseDevelopmentStorage=true",
          tableName
        )
      );

      assert.deepEqual(await reserve(input, {
        ...deps, store: reopened
      }), {
        admitted: true,
        status: "resumed"
      });

      const otherToken = issue(signingSecret, context);
      assert.ok(otherToken);

      assert.deepEqual(await reserve({
        token: otherToken,
        command: {
          ...command,
          submissionId: randomUUID()
        }
      }, deps), {
        admitted: false,
        status: "capacity_exhausted"
      });

      assert.deepEqual(await reserve({
        token,
        command: {
          ...command,
          email: "changed@example.invalid"
        }
      }, deps), {
        admitted: false,
        status: "conflict"
      });
    });

    await t.test("concurrent same-client transactions remain isolated", async () => {
      const firstStore = createStore(client);
      const secondStore = createStore(client);

      const first = rows(
        randomUUID(),
        randomUUID(),
        "slot__29933281__000"
      );

      const second = rows(
        randomUUID(),
        randomUUID(),
        "slot__29933281__001"
      );

      const results = await Promise.all([
        firstStore.createAll(first),
        secondStore.createAll(second)
      ]);

      assert.deepEqual(results, [
        "created", "created"
      ]);

      for (const row of [...first, ...second]) {
        assert.deepEqual(
          await store.read(
            row.partitionKey,
            row.rowKey
          ),
          row
        );
      }
    });

    await t.test("independent clients cannot both claim the same capacity slot", async () => {
      const otherClient = TableClient.fromConnectionString(
        "UseDevelopmentStorage=true",
        tableName
      );

      const otherStore = createStore(otherClient);

      const first = rows(
        randomUUID(),
        randomUUID(),
        "slot__29933282__000"
      );

      const second = rows(
        randomUUID(),
        randomUUID(),
        "slot__29933282__000"
      );

      const results = await Promise.all([
        store.createAll(first),
        otherStore.createAll(second)
      ]);

      assert.equal(
        results.filter(result => result === "created").length,
        1
      );

      assert.equal(
        results.filter(result => result === "conflict").length,
        1
      );

      const winner = results[0] === "created"
        ? first : second;

      const loser = results[0] === "created"
        ? second : first;

      for (const row of winner) {
        assert.deepEqual(
          await store.read(
            row.partitionKey,
            row.rowKey
          ),
          row
        );
      }

      for (const row of loser.slice(0, 2)) {
        assert.equal(
          await store.read(
            row.partitionKey,
            row.rowKey
          ),
          null
        );
      }
    });


  } finally {
    // Delete only the unique synthetic test table.
    await client.deleteTable();
  }
});
