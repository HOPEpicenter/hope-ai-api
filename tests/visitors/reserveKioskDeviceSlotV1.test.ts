import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reserveKioskDeviceSlotV1
} from "../../src/services/visitors/reserveKioskDeviceSlotV1";

const deviceA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const deviceB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const minuteOne = new Date("2026-11-22T15:00:00Z");
const minuteTwo = new Date("2026-11-22T15:01:00Z");

class AtomicMemoryStore {
  rows = new Set<string>();
  attempts = 0;

  async createEntity(entity: any): Promise<unknown> {
    this.attempts++;

    const key = `${entity.partitionKey}/${entity.rowKey}`;

    if (this.rows.has(key)) {
      const error = new Error("synthetic conflict") as
        Error & { statusCode: number };

      error.statusCode = 409;
      throw error;
    }

    // Simulate atomic create: the claim is recorded
    // before another concurrent request can claim it.
    this.rows.add(key);

    return {};
  }
}

test("limiter is disabled by default without writes", async () => {
  const store = new AtomicMemoryStore();

  const result = await reserveKioskDeviceSlotV1(
    deviceA,
    { store, now: minuteOne }
  );

  assert.deepEqual(result, {
    admitted: false,
    reason: "disabled"
  });

  assert.equal(store.attempts, 0);
});

test("one device is limited within one minute", async () => {
  const store = new AtomicMemoryStore();
  const deps = {
    enabled: true,
    store,
    now: minuteOne,
    capacity: 2
  };

  assert.deepEqual(
    await reserveKioskDeviceSlotV1(deviceA, deps),
    { admitted: true }
  );

  assert.deepEqual(
    await reserveKioskDeviceSlotV1(deviceA, deps),
    { admitted: true }
  );

  assert.deepEqual(
    await reserveKioskDeviceSlotV1(deviceA, deps),
    {
      admitted: false,
      reason: "device_capacity_exhausted"
    }
  );
});

test("other device has an independent quota", async () => {
  const store = new AtomicMemoryStore();
  const deps = {
    enabled: true,
    store,
    now: minuteOne,
    capacity: 1
  };

  assert.deepEqual(
    await reserveKioskDeviceSlotV1(deviceA, deps),
    { admitted: true }
  );

  assert.deepEqual(
    await reserveKioskDeviceSlotV1(deviceB, deps),
    { admitted: true }
  );

  assert.equal(store.rows.size, 2);
});

test("concurrent claims cannot exceed device capacity", async () => {
  const store = new AtomicMemoryStore();

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      reserveKioskDeviceSlotV1(deviceA, {
        enabled: true,
        store,
        now: minuteOne,
        capacity: 3
      })
    )
  );

  assert.equal(
    results.filter(result => result.admitted).length,
    3
  );

  assert.equal(store.rows.size, 3);
});

test("a new UTC minute receives fresh device capacity", async () => {
  const store = new AtomicMemoryStore();

  const first = await reserveKioskDeviceSlotV1(deviceA, {
    enabled: true,
    store,
    now: minuteOne,
    capacity: 1
  });

  const second = await reserveKioskDeviceSlotV1(deviceA, {
    enabled: true,
    store,
    now: minuteTwo,
    capacity: 1
  });

  assert.equal(first.admitted, true);
  assert.equal(second.admitted, true);
  assert.equal(store.rows.size, 2);
});

test("storage failure never grants admission", async () => {
  const store = {
    async createEntity() {
      throw new Error("SYNTHETIC_STORAGE_UNAVAILABLE");
    }
  };

  await assert.rejects(
    reserveKioskDeviceSlotV1(deviceA, {
      enabled: true,
      store,
      now: minuteOne
    }),
    /SYNTHETIC_STORAGE_UNAVAILABLE/
  );
});

test("invalid device identifier is rejected before writes", async () => {
  const store = new AtomicMemoryStore();

  await assert.rejects(
    reserveKioskDeviceSlotV1("../untrusted-device", {
      enabled: true,
      store,
      now: minuteOne
    }),
    /INVALID_KIOSK_DEVICE_ID/
  );

  assert.equal(store.attempts, 0);
});

test("invalid capacity fails closed", async () => {
  const store = new AtomicMemoryStore();

  for (const capacity of [0, 21, -1, 1.5]) {
    await assert.rejects(
      reserveKioskDeviceSlotV1(deviceA, {
        enabled: true,
        store,
        now: minuteOne,
        capacity
      }),
      /INVALID_KIOSK_DEVICE_CAPACITY/
    );
  }

  assert.equal(store.attempts, 0);
});

test("device slots contain no visitor information", async () => {
  const rows: any[] = [];

  const store = {
    async createEntity(entity: any) {
      rows.push(entity);
      return {};
    }
  };

  await reserveKioskDeviceSlotV1(deviceA, {
    enabled: true,
    store,
    now: minuteOne,
    capacity: 1
  });

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

test("default quota is five submissions per minute", async () => {
  const store = new AtomicMemoryStore();
  const deps = {
    enabled: true,
    store,
    now: minuteOne
  };

  const results = [];

  for (let i = 0; i < 6; i++) {
    results.push(
      await reserveKioskDeviceSlotV1(deviceA, deps)
    );
  }

  assert.equal(
    results.filter(result => result.admitted).length,
    5
  );

  assert.equal(results[5].admitted, false);
});