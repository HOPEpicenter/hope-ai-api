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