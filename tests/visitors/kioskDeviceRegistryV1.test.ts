import assert from "node:assert/strict";
import { test } from "node:test";
import {
  registerKioskDeviceV1,
  assessKioskDeviceV1,
  revokeKioskDeviceV1
} from "../../src/services/visitors/kioskDeviceRegistryV1";

const id = "77777777-7777-4777-8777-777777777777";
const nowMs = Date.parse("2026-11-22T14:00:00Z");
const now = () => new Date(nowMs);
const seconds = Math.floor(nowMs / 1000);
const expiry = seconds + 3600;

class MemoryStore {
  rows = new Map<string, any>();

  async createEntity(entity: any) {
    const key = `${entity.partitionKey}/${entity.rowKey}`;

    if (this.rows.has(key)) {
      const error: any = new Error("duplicate");
      error.statusCode = 409;
      throw error;
    }

    this.rows.set(key, { ...entity });
  }

  async getEntity(partition: string, row: string) {
    const value = this.rows.get(`${partition}/${row}`);

    if (!value) {
      const error: any = new Error("missing");
      error.statusCode = 404;
      throw error;
    }

    return { ...value };
  }
}

test("disabled registry denies and does not write", async () => {
  const store = new MemoryStore();

  assert.equal(
    await assessKioskDeviceV1(id, expiry, { store, now }),
    false
  );

  await assert.rejects(
    () => registerKioskDeviceV1(id, expiry, {
      store, now
    }),
    /KIOSK_REGISTRY_DISABLED/
  );

  assert.equal(store.rows.size, 0);
});

test("unknown device cannot be admitted", async () => {
  const store = new MemoryStore();

  assert.equal(
    await assessKioskDeviceV1(id, expiry, {
      store, now, enabled: true
    }),
    false
  );
});

test("registered device is admitted until revoked", async () => {
  const store = new MemoryStore();
  const deps = { store, now, enabled: true };

  await registerKioskDeviceV1(id, expiry, deps);

  assert.equal(
    await assessKioskDeviceV1(id, expiry, deps),
    true
  );

  assert.equal(
    await revokeKioskDeviceV1(id, deps),
    "revoked"
  );

  assert.equal(
    await assessKioskDeviceV1(id, expiry, deps),
    false
  );
});

test("revocation is idempotent", async () => {
  const store = new MemoryStore();
  const deps = { store, now, enabled: true };

  assert.equal(
    await revokeKioskDeviceV1(id, deps),
    "revoked"
  );

  assert.equal(
    await revokeKioskDeviceV1(id, deps),
    "already_revoked"
  );

  assert.equal(store.rows.size, 1);
});

test("a pre-revoked ID cannot be registered", async () => {
  const store = new MemoryStore();
  const deps = { store, now, enabled: true };

  await revokeKioskDeviceV1(id, deps);

  await assert.rejects(
    () => registerKioskDeviceV1(id, expiry, deps),
    /DEVICE_ALREADY_REVOKED/
  );
});

test("duplicate issuance cannot overwrite registration", async () => {
  const store = new MemoryStore();
  const deps = { store, now, enabled: true };

  await registerKioskDeviceV1(id, expiry, deps);

  await assert.rejects(
    () => registerKioskDeviceV1(id, expiry, deps),
    (error: any) => error.statusCode === 409
  );

  assert.equal(store.rows.size, 1);
});

test("expiry and claim mismatch deny admission", async () => {
  const store = new MemoryStore();
  const deps = { store, now, enabled: true };

  await registerKioskDeviceV1(id, expiry, deps);

  assert.equal(
    await assessKioskDeviceV1(id, expiry + 1, deps),
    false
  );

  assert.equal(
    await assessKioskDeviceV1(id, expiry, {
      store,
      enabled: true,
      now: () => new Date((expiry + 1) * 1000)
    }),
    false
  );
});

test("excessive token lifetime is rejected", async () => {
  const store = new MemoryStore();

  await assert.rejects(
    () => registerKioskDeviceV1(
      id, seconds + 7201,
      { store, now, enabled: true }
    ),
    /INVALID_DEVICE_EXPIRY/
  );

  assert.equal(store.rows.size, 0);
});

test("storage failure never grants admission", async () => {
  const store = {
    async createEntity() {},
    async getEntity(): Promise<any> {
      throw new Error("STORAGE_UNAVAILABLE");
    }
  };

  await assert.rejects(
    () => assessKioskDeviceV1(id, expiry, {
      store, now, enabled: true
    }),
    /STORAGE_UNAVAILABLE/
  );
});

test("registry rows contain no visitor PII", async () => {
  const store = new MemoryStore();
  const deps = { store, now, enabled: true };

  await registerKioskDeviceV1(id, expiry, deps);
  await revokeKioskDeviceV1(id, deps);

  const values = JSON.stringify([...store.rows.values()]);

  assert.equal(values.includes("guest@example.test"), false);
  assert.equal(values.includes("contactConsent"), false);
  assert.equal(values.includes("HOPE_API_KEY"), false);
});