import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reserveKioskGuestQrSlotV1
} from "../../src/services/visitors/reserveKioskGuestQrSlotV1";

const grantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const grantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sunday = new Date("2026-11-22T15:00:00Z");
const nextMinute = new Date("2026-11-22T15:01:00Z");

class AtomicStore {
  rows = new Map<string, any>();
  attempts = 0;

  async getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<any> {
    const entity = this.rows.get(`${partitionKey}/${rowKey}`);
    if (!entity) {
      const error = new Error("missing") as
        Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }
    return entity;
  }

  async createEntity(entity: any): Promise<unknown> {
    this.attempts++;
    const key = `${entity.partitionKey}/${entity.rowKey}`;

    if (this.rows.has(key)) {
      const error = new Error("duplicate") as
        Error & { statusCode: number };

      error.statusCode = 409;
      throw error;
    }

    this.rows.set(key, entity);
    return {};
  }
}

test("disabled by default with zero writes", async () => {
  const store = new AtomicStore();

  assert.deepEqual(
    await reserveKioskGuestQrSlotV1(
      grantA, { store, now: sunday }
    ),
    { admitted: false, reason: "disabled" }
  );

  assert.equal(store.attempts, 0);
});

test("one grant is limited per minute", async () => {
  const store = new AtomicStore();
  const options = {
    enabled: true,
    capacity: 2,
    store,
    now: sunday
  };

  assert.equal(
    (await reserveKioskGuestQrSlotV1(grantA, options))
      .admitted,
    true
  );

  assert.equal(
    (await reserveKioskGuestQrSlotV1(grantA, options))
      .admitted,
    true
  );

  assert.deepEqual(
    await reserveKioskGuestQrSlotV1(grantA, options),
    { admitted: false, reason: "capacity_exhausted" }
  );
});

test("independent grants have separate quotas", async () => {
  const store = new AtomicStore();
  const options = {
    enabled: true,
    capacity: 1,
    store,
    now: sunday
  };

  assert.equal(
    (await reserveKioskGuestQrSlotV1(grantA, options))
      .admitted,
    true
  );

  assert.equal(
    (await reserveKioskGuestQrSlotV1(grantB, options))
      .admitted,
    true
  );

  assert.equal(store.rows.size, 2);
});

test("concurrent claims cannot exceed quota", async () => {
  const store = new AtomicStore();

  const results = await Promise.all(
    Array.from({ length: 25 }, () =>
      reserveKioskGuestQrSlotV1(grantA, {
        enabled: true,
        store,
        capacity: 3,
        now: sunday
      })
    )
  );

  assert.equal(
    results.filter(result => result.admitted).length,
    3
  );

  assert.equal(store.rows.size, 3);
});

test("new minute receives new quota", async () => {
  const store = new AtomicStore();
  const options = {
    enabled: true,
    capacity: 1,
    store
  };

  assert.equal(
    (await reserveKioskGuestQrSlotV1(
      grantA, { ...options, now: sunday }
    )).admitted,
    true
  );

  assert.equal(
    (await reserveKioskGuestQrSlotV1(
      grantA, { ...options, now: nextMinute }
    )).admitted,
    true
  );
});

test("no admissions outside event day", async () => {
  const store = new AtomicStore();

  for (const now of [
    new Date("2026-11-21T15:00:00Z"),
    new Date("2026-11-23T15:00:00Z")
  ]) {
    assert.deepEqual(
      await reserveKioskGuestQrSlotV1(grantA, {
        enabled: true, store, now
      }),
      { admitted: false, reason: "outside_event" }
    );
  }

  assert.equal(store.attempts, 0);
});

test("invalid grant ID rejected before storage", async () => {
  const store = new AtomicStore();

  await assert.rejects(
    reserveKioskGuestQrSlotV1("../untrusted", {
      enabled: true, store, now: sunday
    }),
    /INVALID_GUEST_QR_GRANT_ID/
  );

  assert.equal(store.attempts, 0);
});

test("invalid capacity fails closed", async () => {
  const store = new AtomicStore();

  for (const capacity of [0, -1, 31, 1.5]) {
    await assert.rejects(
      reserveKioskGuestQrSlotV1(grantA, {
        enabled: true, store, now: sunday, capacity
      }),
      /INVALID_GUEST_QR_CAPACITY/
    );
  }

  assert.equal(store.attempts, 0);
});

test("storage failures never grant admission", async () => {
  await assert.rejects(
    reserveKioskGuestQrSlotV1(grantA, {
      enabled: true,
      now: sunday,
      store: {
        async createEntity() {
          throw new Error("SYNTHETIC_STORE_FAILURE");
        }
      }
    }),
    /SYNTHETIC_STORE_FAILURE/
  );
});

test("quota rows contain no visitor PII", async () => {
  const store = new AtomicStore();

  await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, store, now: sunday
  });

  const rows = [...store.rows.values()];

  assert.equal(rows.length, 1);
  assert.deepEqual(
    Object.keys(rows[0]).sort(),
    ["partitionKey", "rowKey"]
  );

  assert.equal(
    rows[0].partitionKey,
    "friends-family-2026-11-22"
  );

  assert.equal(JSON.stringify(rows).includes("@"), false);
  assert.equal(JSON.stringify(rows).includes("phone"), false);
});

test("default capacity allows 12 claims per minute", async () => {
  const store = new AtomicStore();
  const results = [];

  for (let i = 0; i < 13; i++) {
    results.push(
      await reserveKioskGuestQrSlotV1(grantA, {
        enabled: true, store, now: sunday
      })
    );
  }

  assert.equal(
    results.filter(result => result.admitted).length,
    12
  );

  assert.equal(results[12].admitted, false);
});
test("event-wide claim stays used across minute boundaries", async () => {
  const store = new AtomicStore();

  const first = await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true,
    capacity: 1,
    scope: "event",
    now: sunday,
    store
  });

  const second = await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true,
    capacity: 1,
    scope: "event",
    now: nextMinute,
    store
  });

  assert.equal(first.admitted, true);
  assert.deepEqual(second, {
    admitted: false,
    reason: "capacity_exhausted"
  });
  assert.equal(store.rows.size, 1);
});

test("concurrent event-wide claims admit only one", async () => {
  const store = new AtomicStore();

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      reserveKioskGuestQrSlotV1(grantA, {
        enabled: true,
        capacity: 1,
        scope: "event",
        now: sunday,
        store
      })
    )
  );

  assert.equal(
    results.filter(result => result.admitted).length,
    1
  );
  assert.equal(store.rows.size, 1);
});

test("different guests have independent event claims", async () => {
  const store = new AtomicStore();

  for (const grant of [grantA, grantB]) {
    const result = await reserveKioskGuestQrSlotV1(
      grant,
      {
        enabled: true,
        capacity: 1,
        scope: "event",
        now: sunday,
        store
      }
    );

    assert.equal(result.admitted, true);
  }

  assert.equal(store.rows.size, 2);
});

test("event-wide claim cannot silently permit multiple slots", async () => {
  const store = new AtomicStore();

  for (const capacity of [2, 12, 30]) {
    await assert.rejects(
      reserveKioskGuestQrSlotV1(grantA, {
        enabled: true,
        scope: "event",
        capacity,
        now: sunday,
        store
      }),
      /INVALID_EVENT_CLAIM_CAPACITY/
    );
  }

  assert.equal(store.attempts, 0);
});

test("invalid reservation scope fails closed", async () => {
  const store = new AtomicStore();

  await assert.rejects(
    reserveKioskGuestQrSlotV1(grantA, {
      enabled: true,
      scope: "invalid" as any,
      now: sunday,
      store
    }),
    /INVALID_GUEST_QR_SCOPE/
  );

  assert.equal(store.attempts, 0);
});
test("identical bound retry is admitted after uncertain write", async () => {
  const store = new AtomicStore();
  const claimHash = "a".repeat(64);

  const first = await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, capacity: 1, scope: "event",
    claimHash, now: sunday, store
  });

  const retry = await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, capacity: 1, scope: "event",
    claimHash, now: nextMinute, store
  });

  assert.equal(first.admitted, true);
  assert.equal(retry.admitted, true);
  assert.equal(store.rows.size, 1);
});

test("changed payload or idempotency key cannot reuse claim", async () => {
  const store = new AtomicStore();

  await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, capacity: 1, scope: "event",
    claimHash: "a".repeat(64), now: sunday, store
  });

  const changed = await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, capacity: 1, scope: "event",
    claimHash: "b".repeat(64), now: nextMinute, store
  });

  assert.deepEqual(changed, {
    admitted: false, reason: "capacity_exhausted"
  });
});

test("concurrent identical bound retries create only one row", async () => {
  const store = new AtomicStore();

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      reserveKioskGuestQrSlotV1(grantA, {
        enabled: true, capacity: 1, scope: "event",
        claimHash: "c".repeat(64), now: sunday, store
      })
    )
  );

  assert.equal(results.every(result => result.admitted), true);
  assert.equal(store.rows.size, 1);
});

test("unbound legacy claim cannot be reused", async () => {
  const store = new AtomicStore();

  await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, capacity: 1, scope: "event",
    now: sunday, store
  });

  const retry = await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, capacity: 1, scope: "event",
    claimHash: "d".repeat(64), now: sunday, store
  });

  assert.equal(retry.admitted, false);
});

test("unreadable reservation never permits retry", async () => {
  const store = new AtomicStore();

  await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, capacity: 1, scope: "event",
    claimHash: "e".repeat(64), now: sunday, store
  });

  const inaccessible = {
    createEntity: (entity: any) => store.createEntity(entity),
    async getEntity() {
      throw new Error("UNAVAILABLE_STORAGE");
    }
  };

  await assert.rejects(
    reserveKioskGuestQrSlotV1(grantA, {
      enabled: true, capacity: 1, scope: "event",
      claimHash: "e".repeat(64), now: sunday,
      store: inaccessible
    }),
    /UNAVAILABLE_STORAGE/
  );
});

test("malformed claim fingerprint is denied before writes", async () => {
  const store = new AtomicStore();

  await assert.rejects(
    reserveKioskGuestQrSlotV1(grantA, {
      enabled: true, capacity: 1, scope: "event",
      claimHash: "invalid", now: sunday, store
    }),
    /INVALID_GUEST_QR_CLAIM_HASH/
  );

  assert.equal(store.attempts, 0);
});

test("reservation stores only opaque non-PII fingerprint", async () => {
  const store = new AtomicStore();

  await reserveKioskGuestQrSlotV1(grantA, {
    enabled: true, capacity: 1, scope: "event",
    claimHash: "f".repeat(64), now: sunday, store
  });

  const row = [...store.rows.values()][0];

  assert.deepEqual(
    Object.keys(row).sort(),
    ["claimHash", "partitionKey", "rowKey"]
  );
});