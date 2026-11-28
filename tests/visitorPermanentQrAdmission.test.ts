import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  issuePermanentVisitorQrGrant as issue,
  type PermanentQrGrantContext
} from "../src/services/visitors/permanentVisitorQrGrant";

import {
  reservePermanentVisitorQrAdmission as reserve,
  type ReservationRow,
  type PermanentQrReservationStore
} from "../src/services/visitors/reservePermanentVisitorQrAdmission";

const signingSecret =
  "synthetic-permanent-qr-signing-secret-only";

const claimSecret =
  "synthetic-independent-claim-secret-only";

const event = {
  id: "synthetic-sunday-service",
  date: "2026-11-29",
  name: "Synthetic Sunday Service",
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
    activationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    eventId: event.id,
    date: event.date,
    opensAtMs: Date.parse("2026-11-29T14:00:00Z"),
    closesAtMs: Date.parse("2026-11-29T18:00:00Z")
  }
};

const command = {
  submissionId: "11111111-1111-4111-8111-111111111111",
  serviceId: event.id,
  name: "Synthetic Guardian",
  email: "synthetic@example.invalid"
};

const secondCommand = {
  ...command,
  submissionId: "22222222-2222-4222-8222-222222222222"
};

function grant(
  current: PermanentQrGrantContext = context
): string {
  const token = issue(signingSecret, current);
  assert.ok(token);
  return token;
}

function fixture() {
  const rows = new Map<string, ReservationRow>();

  const stats = {
    transactions: 0,
    lostAcknowledgement: false
  };

  const store: PermanentQrReservationStore = {
    async read(partitionKey, rowKey) {
      return rows.get(
        `${partitionKey}/${rowKey}`
      ) ?? null;
    },

    async createAll(entities) {
      stats.transactions++;

      const keys = entities.map(row =>
        `${row.partitionKey}/${row.rowKey}`
      );

      assert.equal(new Set(keys).size, entities.length);
      assert.equal(
        new Set(entities.map(row => row.partitionKey)).size,
        1
      );

      if (keys.some(key => rows.has(key))) {
        return "conflict";
      }

      // Synthetic atomic transaction: no asynchronous
      // boundary between conflict check and insertion.
      entities.forEach((row, index) => {
        rows.set(keys[index], row);
      });

      if (stats.lostAcknowledgement) {
        stats.lostAcknowledgement = false;
        throw new Error("synthetic lost acknowledgement");
      }

      return "created";
    }
  };

  const deps = {
    enabled: true,
    signingSecret,
    claimSecret,
    context,
    capacity: 2,
    store
  };

  return { rows, stats, deps };
}

test("valid registration reserves three atomic binding rows", async () => {
  const f = fixture();

  assert.deepEqual(
    await reserve({ token: grant(), command }, f.deps),
    { admitted: true, status: "reserved" }
  );

  assert.equal(f.rows.size, 3);
  assert.equal(f.stats.transactions, 1);
});

test("disabled or missing storage boundary denies admission", async () => {
  const f = fixture();
  const input = { token: grant(), command };

  assert.equal((await reserve(input)).admitted, false);

  assert.equal((await reserve(input, {
    ...f.deps, enabled: false
  })).admitted, false);

  assert.equal(f.rows.size, 0);
});

test("invalid grant and mismatched event cannot reserve capacity", async () => {
  const f = fixture();

  assert.equal((await reserve({
    token: "invalid", command
  }, f.deps)).admitted, false);

  assert.equal((await reserve({
    token: grant(),
    command: { ...command, serviceId: "wrong-event" }
  }, f.deps)).admitted, false);

  assert.equal(f.rows.size, 0);
});

test("identical retry resumes without another capacity transaction", async () => {
  const f = fixture();
  const input = { token: grant(), command };

  assert.equal((await reserve(input, f.deps)).admitted, true);

  assert.deepEqual(
    await reserve(input, f.deps),
    { admitted: true, status: "resumed" }
  );

  assert.equal(f.rows.size, 3);
  assert.equal(f.stats.transactions, 1);
});

test("same grant cannot authorize another submission", async () => {
  const f = fixture();
  const token = grant();

  assert.equal((await reserve({
    token, command
  }, f.deps)).admitted, true);

  assert.deepEqual(await reserve({
    token, command: secondCommand
  }, f.deps), {
    admitted: false, status: "conflict"
  });

  assert.equal(f.rows.size, 3);
});

test("same submission cannot be claimed by another grant", async () => {
  const f = fixture();

  assert.equal((await reserve({
    token: grant(), command
  }, f.deps)).admitted, true);

  assert.deepEqual(await reserve({
    token: grant(), command
  }, f.deps), {
    admitted: false, status: "conflict"
  });

  assert.equal(f.rows.size, 3);
});

test("changed contact or family data conflicts with existing claim", async () => {
  const f = fixture();
  const token = grant();

  const familyCommand = {
    ...command,
    family: {
      guardianName: command.name,
      guardianDeclaration: true as const,
      children: [{
        firstName: "Synthetic Child",
        ageGroup: "6-11" as const
      }]
    }
  };

  assert.equal((await reserve({
    token, command: familyCommand
  }, f.deps)).admitted, true);

  const changes = [
    {
      ...familyCommand,
      email: "changed@example.invalid"
    },
    {
      ...familyCommand,
      family: {
        ...familyCommand.family,
        children: [{
          firstName: "Different Synthetic Child",
          ageGroup: "6-11" as const
        }]
      }
    },
    command
  ];

  for (const changed of changes) {
    assert.deepEqual(await reserve({
      token, command: changed
    }, f.deps), {
      admitted: false, status: "conflict"
    });
  }

  assert.equal(f.rows.size, 3);
});

test("capacity is shared by independent QR grants", async () => {
  const f = fixture();
  f.deps.capacity = 1;

  assert.equal((await reserve({
    token: grant(), command
  }, f.deps)).admitted, true);

  assert.deepEqual(await reserve({
    token: grant(), command: secondCommand
  }, f.deps), {
    admitted: false,
    status: "capacity_exhausted"
  });

  assert.equal(f.rows.size, 3);
});

test("next minute permits new capacity without losing prior claims", async () => {
  const f = fixture();
  f.deps.capacity = 1;

  const first = { token: grant(), command };

  assert.equal((await reserve(first, f.deps)).admitted, true);

  const later = {
    ...context,
    nowMs: context.nowMs + 60000
  };

  const deps = { ...f.deps, context: later };

  assert.equal((await reserve({
    token: grant(later),
    command: secondCommand
  }, deps)).admitted, true);

  assert.deepEqual(await reserve(first, deps), {
    admitted: true, status: "resumed"
  });

  assert.equal(f.rows.size, 6);
});

test("different approved events have isolated capacity partitions", async () => {
  const f = fixture();
  f.deps.capacity = 1;

  assert.equal((await reserve({
    token: grant(), command
  }, f.deps)).admitted, true);

  const other = { ...event, id: "second-approved-event" };

  const changed: PermanentQrGrantContext = {
    ...context,
    selectedEventId: other.id,
    approvedEvents: [event, other],
    policy: {
      ...context.policy!,
      eventId: other.id
    }
  };

  assert.equal((await reserve({
    token: grant(changed),
    command: {
      ...secondCommand,
      serviceId: other.id
    }
  }, {
    ...f.deps, context: changed
  })).admitted, true);

  assert.equal(new Set(
    [...f.rows.values()].map(row => row.partitionKey)
  ).size, 2);
});

test("concurrent identical reservations create only one claim", async () => {
  const f = fixture();
  const input = { token: grant(), command };

  const results = await Promise.all([
    reserve(input, f.deps),
    reserve(input, f.deps)
  ]);

  assert.equal(results.filter(
    result => result.admitted
  ).length, 2);

  assert.equal(results.filter(
    result => result.admitted && result.status === "reserved"
  ).length, 1);

  assert.equal(f.rows.size, 3);
});

test("lost transaction acknowledgement permits later exact recovery", async () => {
  const f = fixture();
  const input = { token: grant(), command };

  f.stats.lostAcknowledgement = true;

  assert.deepEqual(await reserve(input, f.deps), {
    admitted: false, status: "unavailable"
  });

  assert.equal(f.rows.size, 3);

  assert.deepEqual(await reserve(input, f.deps), {
    admitted: true, status: "resumed"
  });

  assert.equal(f.stats.transactions, 1);
});

test("missing transaction row fails closed", async () => {
  const f = fixture();
  const input = { token: grant(), command };

  assert.equal((await reserve(input, f.deps)).admitted, true);

  const slot = [...f.rows.keys()].find(
    key => key.includes("/slot__")
  );

  assert.ok(slot);
  f.rows.delete(slot);

  assert.deepEqual(await reserve(input, f.deps), {
    admitted: false, status: "unavailable"
  });
});

test("expired grant cannot resume an existing claim", async () => {
  const f = fixture();
  const input = { token: grant(), command };

  assert.equal((await reserve(input, f.deps)).admitted, true);

  assert.equal((await reserve(input, {
    ...f.deps,
    context: {
      ...context,
      nowMs: context.nowMs + 3600000
    }
  })).admitted, false);

  assert.equal(f.rows.size, 3);
});

test("quota rows contain no raw visitor data or credentials", async () => {
  const f = fixture();
  const token = grant();

  assert.equal((await reserve({
    token, command
  }, f.deps)).admitted, true);

  const serialized = JSON.stringify([...f.rows.values()]);

  for (const forbidden of [
    command.name,
    command.email,
    token,
    signingSecret,
    claimSecret
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }

  for (const row of f.rows.values()) {
    assert.match(row.claimHash, /^[0-9a-f]{64}$/);
  }
});

test("unknown storage failure and invalid claim secret fail closed", async () => {
  const f = fixture();
  const input = { token: grant(), command };

  assert.equal((await reserve(input, {
    ...f.deps,
    claimSecret: signingSecret
  })).admitted, false);

  assert.equal((await reserve(input, {
    ...f.deps,
    capacity: 101
  })).admitted, false);

  assert.deepEqual(await reserve(input, {
    ...f.deps,
    store: {
      ...f.deps.store,
      read: async () => {
        throw new Error("synthetic storage failure");
      }
    }
  }), {
    admitted: false, status: "unavailable"
  });

  assert.equal(f.rows.size, 0);
});


test("reactivation rejects old grants without resetting reservation capacity", async () => {
  const f = fixture();

  const oldToken = grant();

  const original = {
    token: oldToken,
    command
  };

  f.deps.capacity = 1;

  assert.deepEqual(
    await reserve(original, f.deps),
    { admitted: true, status: "reserved" }
  );

  const reactivated: PermanentQrGrantContext = {
    ...context,
    policy: {
      ...context.policy!,
      activationId:
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }
  };

  const deps = {
    ...f.deps,
    context: reactivated
  };

  assert.deepEqual(
    await reserve(original, deps),
    { admitted: false, status: "denied" }
  );

  const newToken = grant(reactivated);

  // Reactivation cannot erase an earlier submission claim.
  assert.deepEqual(
    await reserve({
      token: newToken,
      command
    }, deps),
    { admitted: false, status: "conflict" }
  );

  // Reactivation also cannot reset the same-minute quota.
  assert.deepEqual(
    await reserve({
      token: newToken,
      command: secondCommand
    }, deps),
    {
      admitted: false,
      status: "capacity_exhausted"
    }
  );

  assert.equal(f.rows.size, 3);

  // Normal capacity becomes available in the next minute.
  const later: PermanentQrGrantContext = {
    ...reactivated,
    nowMs: reactivated.nowMs + 60000
  };

  assert.deepEqual(
    await reserve({
      token: grant(later),
      command: secondCommand
    }, {
      ...deps,
      context: later
    }),
    { admitted: true, status: "reserved" }
  );

  assert.equal(f.rows.size, 6);
});
