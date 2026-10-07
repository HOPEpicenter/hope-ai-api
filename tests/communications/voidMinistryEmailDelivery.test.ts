import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import { MinistryEmailDeliveriesRepository } from "../../src/repositories/ministryEmailDeliveriesRepository";
import { voidMinistryEmailDelivery } from "../../src/services/communications/voidMinistryEmailDelivery";

type Entity = { partitionKey: string; rowKey: string; deliveryJson: string; etag: string };

class FakeTable {
  readonly entities = new Map<string, Entity>();
  private version = 0;
  beforeUpdate: (() => void) | null = null;
  failGet = false;
  failUpdate = false;

  async createEntity(entity: Omit<Entity, "etag">): Promise<void> {
    this.entities.set(`${entity.partitionKey}::${entity.rowKey}`, { ...entity, etag: `etag-${++this.version}` });
  }
  async getEntity(partitionKey: string, rowKey: string): Promise<Entity> {
    if (this.failGet) throw new Error("storage secret detail");
    const entity = this.entities.get(`${partitionKey}::${rowKey}`);
    if (!entity) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    return { ...entity };
  }
  async updateEntity(entity: Omit<Entity, "etag">, _mode: "Replace", options: { etag: string }): Promise<void> {
    this.beforeUpdate?.();
    this.beforeUpdate = null;
    if (this.failUpdate) throw new Error("timeout after possible write");
    const key = `${entity.partitionKey}::${entity.rowKey}`;
    const current = this.entities.get(key);
    if (!current) throw Object.assign(new Error("Not found"), { statusCode: 404 });
    if (current.etag !== options.etag) throw Object.assign(new Error("412"), { statusCode: 412 });
    this.entities.set(key, { ...entity, etag: `etag-${++this.version}` });
  }
}

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-void-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "requested",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "Exact subject",
  body: "Exact body \u00C6 text",
  recipientEmail: "private@example.org",
  eligibility: { phase5Enabled: true, contactConsent: true, emailPreference: "granted" },
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};
const dispatching: MinistryEmailDeliveryRecord = {
  ...requested, state: "dispatching",
  dispatchAttemptId: "attempt-1", dispatchClaimedAt: "2026-10-03T12:01:00.000Z"
};
const accepted: MinistryEmailDeliveryRecord = {
  ...dispatching, state: "provider_accepted", provider: "sendgrid",
  providerMessageId: "m-1", providerAcceptedAt: "2026-10-03T12:02:00.000Z"
};
const failed: MinistryEmailDeliveryRecord = {
  ...dispatching, state: "failed", provider: "sendgrid",
  failedAt: "2026-10-03T12:02:00.000Z", failureCode: "known"
};
const T1 = "2026-10-04T10:00:00.000Z";
const T2 = "2026-10-05T10:00:00.000Z";

async function setup(record: MinistryEmailDeliveryRecord = requested) {
  const table = new FakeTable();
  const repository = new MinistryEmailDeliveriesRepository(async () => table);
  await repository.create(record);
  return { table, repository };
}
const input = { deliveryId: requested.deliveryId, actorId: "admin-1", reason: "  Corrupted characters  " };

async function run(): Promise<void> {
  {
    const { repository } = await setup();
    const r = await voidMinistryEmailDelivery(input, { repository, now: () => T1 });
    assert.deepEqual(r, { status: "voided", deliveryId: requested.deliveryId, voidedAt: T1 });
    const stored = await repository.getById(requested.deliveryId);
    assert.deepEqual(stored, {
      ...requested, state: "voided", voidedAt: T1, voidedBy: "admin-1", voidReason: "Corrupted characters"
    });

    // Replay is idempotent and keeps the original audit metadata.
    const replay = await voidMinistryEmailDelivery(
      { ...input, actorId: "admin-2", reason: "Different" },
      { repository, now: () => T2 }
    );
    assert.deepEqual(replay, { status: "already_voided", deliveryId: requested.deliveryId, voidedAt: T1 });
    assert.deepEqual(await repository.getById(requested.deliveryId), stored);
  }

  for (const record of [dispatching, accepted, failed]) {
    const { repository } = await setup(record);
    const r = await voidMinistryEmailDelivery(input, { repository, now: () => T1 });
    assert.equal(r.status, "not_voidable");
    assert.deepEqual(await repository.getById(record.deliveryId), record);
  }

  {
    const { repository } = await setup({ ...requested, dispatchAttemptId: "x" });
    assert.equal((await voidMinistryEmailDelivery(input, { repository })).status, "not_voidable");
  }

  {
    const { repository } = await setup();
    assert.equal(
      (await voidMinistryEmailDelivery({ ...input, deliveryId: "missing" }, { repository })).status,
      "not_found"
    );
  }

  for (const bad of [
    { ...input, deliveryId: "" }, { ...input, deliveryId: " x " },
    { ...input, actorId: " " }, { ...input, reason: "   " },
    { ...input, reason: undefined }, { ...input, reason: "x".repeat(241) }
  ]) {
    let reads = 0;
    const r = await voidMinistryEmailDelivery(bad, {
      repository: {
        readVersionedById: async () => { reads += 1; return null; },
        voidIfVersion: async () => true
      }
    });
    assert.equal(r.status, "invalid_input");
    assert.equal(reads, 0);
  }
  assert.equal(
    (await voidMinistryEmailDelivery({ ...input, reason: "x".repeat(240) }, {
      repository: (await setup()).repository
    })).status,
    "voided"
  );

  // Concurrent transition: no automatic retry, original state untouched by void.
  {
    const { table, repository } = await setup();
    let updates = 0;
    table.beforeUpdate = () => {
      updates += 1;
      const key = [...table.entities.keys()][0];
      const entity = table.entities.get(key)!;
      table.entities.set(key, {
        ...entity, etag: "etag-concurrent", deliveryJson: JSON.stringify(dispatching)
      });
    };
    const r = await voidMinistryEmailDelivery(input, { repository, now: () => T1 });
    assert.equal(r.status, "conflict");
    assert.equal(updates, 1);
    assert.deepEqual(await repository.getById(requested.deliveryId), dispatching);
  }

  // Repository rejects stale versions and non-requested sources directly.
  {
    const { repository } = await setup();
    const v = await repository.readVersionedById(requested.deliveryId);
    const next = { ...requested, state: "voided" as const, voidedAt: T1, voidedBy: "a", voidReason: "r" };
    assert.equal(await repository.voidIfVersion(next, "stale"), false);
    assert.equal(await repository.voidIfVersion({ ...next, body: "rewritten" }, v!.version), false);
    assert.equal(await repository.voidIfVersion({ ...next, voidReason: " " }, v!.version), false);
    assert.equal(await repository.voidIfVersion(next, v!.version), true);
    const v2 = await repository.readVersionedById(requested.deliveryId);
    assert.equal(await repository.voidIfVersion({ ...next, voidedBy: "other" }, v2!.version), false);
    assert.equal((await repository.getById(requested.deliveryId))!.voidedBy, "a");
  }

  // Storage uncertainty is never success.
  {
    const { table, repository } = await setup();
    table.failGet = true;
    assert.equal((await voidMinistryEmailDelivery(input, { repository })).status, "persistence_uncertain");
    table.failGet = false;
    table.failUpdate = true;
    const r = await voidMinistryEmailDelivery(input, { repository, now: () => T1 });
    assert.equal(r.status, "persistence_uncertain");
    assert.equal(JSON.stringify(r).includes("timeout"), false);
  }

  console.log("voidMinistryEmailDelivery.test.ts passed");
}

run().catch(error => { console.error(error); process.exit(1); });
