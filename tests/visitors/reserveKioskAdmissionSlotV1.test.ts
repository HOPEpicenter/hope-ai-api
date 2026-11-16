import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reserveKioskAdmissionSlotV1
} from "../../src/services/visitors/reserveKioskAdmissionSlotV1";

const time = () => new Date("2026-11-22T15:45:30.000Z");

class MemorySlots {
  rows = new Map<string, any>();

  async createEntity(entity: any) {
    const key = `${entity.partitionKey}/${entity.rowKey}`;

    if (this.rows.has(key)) {
      const error: any = new Error("Already exists");
      error.statusCode = 409;
      throw error;
    }

    this.rows.set(key, { ...entity });
  }
}

test("default-disabled admission does not write", async () => {
  const store = new MemorySlots();

  const result = await reserveKioskAdmissionSlotV1({
    store, now: time
  });

  assert.deepEqual(result, {
    admitted: false,
    reason: "disabled"
  });

  assert.equal(store.rows.size, 0);
});

test("capacity is enforced across repeated calls", async () => {
  const store = new MemorySlots();
  const deps = {
    store, now: time, enabled: true, capacity: 2
  };

  assert.deepEqual(
    await reserveKioskAdmissionSlotV1(deps),
    { admitted: true }
  );

  assert.deepEqual(
    await reserveKioskAdmissionSlotV1(deps),
    { admitted: true }
  );

  assert.deepEqual(
    await reserveKioskAdmissionSlotV1(deps),
    {
      admitted: false,
      reason: "capacity_exhausted"
    }
  );

  assert.equal(store.rows.size, 2);
});

test("atomic concurrent claims cannot exceed capacity", async () => {
  const store = new MemorySlots();

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      reserveKioskAdmissionSlotV1({
        store, now: time, enabled: true, capacity: 3
      })
    )
  );

  assert.equal(
    results.filter(result => result.admitted).length,
    3
  );

  assert.equal(store.rows.size, 3);
});

test("a new UTC minute receives a fresh capacity", async () => {
  const store = new MemorySlots();

  const first = await reserveKioskAdmissionSlotV1({
    store, now: time, enabled: true, capacity: 1
  });

  const second = await reserveKioskAdmissionSlotV1({
    store,
    now: () => new Date("2026-11-22T15:46:00.000Z"),
    enabled: true,
    capacity: 1
  });

  assert.equal(first.admitted, true);
  assert.equal(second.admitted, true);
  assert.equal(store.rows.size, 2);
});

test("storage failure cannot grant admission", async () => {
  const store = {
    async createEntity() {
      throw new Error("STORAGE_UNAVAILABLE");
    }
  };

  await assert.rejects(
    () => reserveKioskAdmissionSlotV1({
      store, now: time, enabled: true
    }),
    /STORAGE_UNAVAILABLE/
  );
});

test("invalid capacity fails closed", async () => {
  const store = new MemorySlots();

  await assert.rejects(
    () => reserveKioskAdmissionSlotV1({
      store, now: time, enabled: true, capacity: 0
    }),
    /INVALID_KIOSK_CAPACITY/
  );

  assert.equal(store.rows.size, 0);
});

test("reservation stores no visitor information", async () => {
  const store = new MemorySlots();

  await reserveKioskAdmissionSlotV1({
    store, now: time, enabled: true
  });

  const serialized = JSON.stringify(
    [...store.rows.values()]
  );

  assert.equal(
    serialized.includes("guest@example.test"),
    false
  );

  assert.equal(
    serialized.includes("contactConsent"),
    false
  );
});