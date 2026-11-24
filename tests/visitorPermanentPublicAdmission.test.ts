import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";

import {
  reservePermanentPublicVisitAdmission as reserve,
  type ReservationRow,
  type PermanentQrReservationStore
} from "../src/services/visitors/reservePermanentVisitorQrAdmission";

import {
  issuePermanentPublicVisitSession as issue
} from "../src/services/visitors/permanentPublicVisitSession";

import type {
  PermanentPublicVisitContext
} from "../src/services/visitors/resolvePermanentPublicVisitEvent";

import {
  createPermanentVisitorQrReservationStore
} from "../src/repositories/permanentVisitorQrReservationStore";

const signingSecret =
  "synthetic-public-session-signing-secret-only";

const claimSecret =
  "synthetic-independent-public-claim-secret-only";

const context: PermanentPublicVisitContext = {
  enabled: true,
  nowMs: Date.parse("2026-11-24T19:00:00Z"),
  approvedEvents: []
};

const command = {
  submissionId: "11111111-1111-4111-8111-111111111111",
  serviceId: "visit-2026-11-24",
  name: "Synthetic Public Visitor",
  email: "synthetic@example.invalid",
  profile: {
    visitType: "first" as const,
    churchHome: "looking" as const,
    interests: ["prayer"] as const,
    invitedBy: "Synthetic Inviter",
    contactConsent: true
  }
};

const secondCommand = {
  ...command,
  submissionId: "22222222-2222-4222-8222-222222222222"
};

function session(
  current: PermanentPublicVisitContext = context
): string {
  const token = issue(signingSecret, current);
  assert.ok(token);
  return token;
}

function fixture(capacity = 2) {
  const rows = new Map<string, ReservationRow>();
  let transactions = 0;

  const store: PermanentQrReservationStore = {
    async read(partitionKey, rowKey) {
      return rows.get(
        `${partitionKey}/${rowKey}`
      ) ?? null;
    },

    async createAll(entities) {
      transactions++;

      assert.equal(entities.length, 3);

      assert.equal(
        new Set(entities.map(row =>
          row.partitionKey
        )).size,
        1
      );

      const keys = entities.map(row =>
        `${row.partitionKey}/${row.rowKey}`
      );

      assert.equal(new Set(keys).size, 3);

      if (keys.some(key => rows.has(key))) {
        return "conflict";
      }

      entities.forEach((row, index) =>
        rows.set(keys[index], row)
      );

      return "created";
    }
  };

  const deps = {
    enabled: true,
    signingSecret,
    claimSecret,
    context,
    capacity,
    store
  };

  return {
    rows,
    deps,
    transactions: () => transactions
  };
}

test("automatic public session reserves durable admission without activation", async () => {
  const f = fixture();

  const input = {
    token: session(),
    command
  };

  assert.deepEqual(
    await reserve(input, f.deps),
    { admitted: true, status: "reserved" }
  );

  assert.equal(f.rows.size, 3);

  assert.deepEqual(
    await reserve(input, f.deps),
    { admitted: true, status: "resumed" }
  );

  assert.equal(f.transactions(), 1);
});

test("changed payload and replacement session cannot bypass a submission claim", async () => {
  const f = fixture();
  const token = session();

  assert.deepEqual(
    await reserve({ token, command }, f.deps),
    { admitted: true, status: "reserved" }
  );

  assert.deepEqual(
    await reserve({
      token,
      command: {
        ...command,
        email: "changed@example.invalid"
      }
    }, f.deps),
    { admitted: false, status: "conflict" }
  );

  assert.deepEqual(
    await reserve({
      token: session(),
      command
    }, f.deps),
    { admitted: false, status: "conflict" }
  );

  assert.equal(f.rows.size, 3);
});

test("one public session cannot authorize multiple submissions", async () => {
  const f = fixture();
  const token = session();

  assert.deepEqual(
    await reserve({ token, command }, f.deps),
    { admitted: true, status: "reserved" }
  );

  assert.deepEqual(
    await reserve({
      token,
      command: secondCommand
    }, f.deps),
    { admitted: false, status: "conflict" }
  );
});

test("independent public browsers share the same event capacity", async () => {
  const f = fixture(1);

  assert.deepEqual(
    await reserve({
      token: session(),
      command
    }, f.deps),
    { admitted: true, status: "reserved" }
  );

  assert.deepEqual(
    await reserve({
      token: session(),
      command: secondCommand
    }, f.deps),
    {
      admitted: false,
      status: "capacity_exhausted"
    }
  );

  const later = {
    ...context,
    nowMs: context.nowMs + 60000
  };

  assert.deepEqual(
    await reserve({
      token: session(later),
      command: secondCommand
    }, {
      ...f.deps,
      context: later
    }),
    { admitted: true, status: "reserved" }
  );

  assert.equal(f.rows.size, 6);
});

test("expired sessions and mismatched events are denied before storage writes", async () => {
  const f = fixture();
  const token = session();

  assert.deepEqual(
    await reserve({ token, command }, {
      ...f.deps,
      context: {
        ...context,
        nowMs: context.nowMs + 600000
      }
    }),
    { admitted: false, status: "denied" }
  );

  assert.deepEqual(
    await reserve({
      token,
      command: {
        ...command,
        serviceId: "wrong-event"
      }
    }, f.deps),
    { admitted: false, status: "denied" }
  );

  assert.equal(f.rows.size, 0);
  assert.equal(f.transactions(), 0);
});

test("disabled admission and unknown storage errors fail closed", async () => {
  const f = fixture();

  const input = {
    token: session(),
    command
  };

  const disabled = await reserve(input, {
    ...f.deps,
    enabled: false
  });

  assert.equal(disabled.admitted, false);

  const failed = await reserve(input, {
    ...f.deps,
    store: {
      async read() {
        throw new Error("synthetic storage failure");
      },
      async createAll() {
        throw new Error("unexpected transaction");
      }
    }
  });

  assert.deepEqual(failed, {
    admitted: false,
    status: "unavailable"
  });

  assert.equal(f.rows.size, 0);
});

test("automatic public admission persists and resumes through actual local Table SDK", {
  skip: process.env.HOPE_VISITOR_57_LOCAL_ACCEPTANCE !== "true",
  timeout: 120000
}, async () => {
  const tableName =
    "HopeVisitor66" +
    randomUUID().replace(/-/g, "");

  const client = createIsolatedVisitorTestTable(

    tableName
  );

  const endpoint = new URL(client.url);

  assert.equal(endpoint.protocol, "http:");
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert.equal(endpoint.port, process.env.HOPE_VISITOR_133_PORT);
  assert.notEqual(endpoint.port, "10002");

  assert.equal(
    endpoint.pathname.replace(/\/$/, ""),
    "/hopevisitor133"
  );

  await client.createTable();

  try {
    const deps = {
      enabled: true,
      signingSecret,
      claimSecret,
      context,
      capacity: 1,
      store:
        createPermanentVisitorQrReservationStore(client)
    };

    const input = {
      token: session(),
      command
    };

    assert.deepEqual(
      await reserve(input, deps),
      { admitted: true, status: "reserved" }
    );

    const reopened = createIsolatedVisitorTestTable(

      tableName
    );

    assert.deepEqual(
      await reserve(input, {
        ...deps,
        store:
          createPermanentVisitorQrReservationStore(reopened)
      }),
      { admitted: true, status: "resumed" }
    );

    assert.deepEqual(
      await reserve({
        token: session(),
        command: secondCommand
      }, deps),
      {
        admitted: false,
        status: "capacity_exhausted"
      }
    );

    assert.deepEqual(
      await reserve({
        token: input.token,
        command: {
          ...command,
          email: "changed@example.invalid"
        }
      }, deps),
      { admitted: false, status: "conflict" }
    );

    const persisted: unknown[] = [];

    for await (const row of client.listEntities()) {
      persisted.push(row);
    }

    assert.equal(persisted.length, 3);

    const serialized = JSON.stringify(persisted);

    for (const forbidden of [
      command.name,
      command.email,
      signingSecret,
      claimSecret,
      input.token
    ]) {
      assert.equal(
        serialized.includes(forbidden),
        false
      );
    }
  } finally {
    await client.deleteTable();
  }
});

test("every accepted public profile field is bound to the durable claim", async () => {
  const f = fixture();
  const token = session();

  assert.deepEqual(
    await reserve({ token, command }, f.deps),
    { admitted: true, status: "reserved" }
  );

  for (const changed of [
    { visitType: "returning" as const },
    { churchHome: "no" as const },
    { interests: ["church_events"] as const },
    { invitedBy: "Different Inviter" },
    { contactConsent: false }
  ]) {
    assert.deepEqual(
      await reserve({
        token,
        command: {
          ...command,
          profile: {
            ...command.profile,
            ...changed
          }
        }
      }, f.deps),
      { admitted: false, status: "conflict" }
    );
  }

  assert.equal(f.transactions(), 1);

  const rows = JSON.stringify([...f.rows.values()]);

  assert.equal(
    rows.includes(command.profile.invitedBy),
    false
  );

  assert.deepEqual(
    await reserve({ token, command }, f.deps),
    { admitted: true, status: "resumed" }
  );
});
