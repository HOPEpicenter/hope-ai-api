import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import {
  MinistryEmailDeliveriesRepository,
  MINISTRY_EMAIL_DELIVERIES_TABLE_NAME
} from "../../src/repositories/ministryEmailDeliveriesRepository";

type Entity = {
  partitionKey: string;
  rowKey: string;
  deliveryJson: string;
  etag: string;
};

class FakeTable {
  readonly entities = new Map<string, Entity>();
  private version = 0;
  beforeUpdate: (() => void) | null = null;

  async createEntity(entity: Omit<Entity, "etag">): Promise<void> {
    const key = `${entity.partitionKey}::${entity.rowKey}`;
    if (this.entities.has(key)) {
      throw Object.assign(new Error("Already exists"), {
        statusCode: 409,
        code: "EntityAlreadyExists"
      });
    }
    this.entities.set(key, { ...entity, etag: `etag-${++this.version}` });
  }

  async getEntity(partitionKey: string, rowKey: string): Promise<Entity> {
    const entity = this.entities.get(`${partitionKey}::${rowKey}`);
    if (!entity) {
      throw Object.assign(new Error("Not found"), {
        statusCode: 404,
        code: "ResourceNotFound"
      });
    }
    return { ...entity };
  }

  async updateEntity(
    entity: Omit<Entity, "etag">,
    mode: "Replace",
    options: { etag: string }
  ): Promise<void> {
    assert.equal(mode, "Replace");
    this.beforeUpdate?.();
    this.beforeUpdate = null;
    const key = `${entity.partitionKey}::${entity.rowKey}`;
    const current = this.entities.get(key);
    if (!current) {
      throw Object.assign(new Error("Not found"), {
        statusCode: 404,
        code: "ResourceNotFound"
      });
    }
    if (current.etag !== options.etag) {
      throw Object.assign(new Error("Precondition failed"), {
        statusCode: 412,
        code: "UpdateConditionNotSatisfied"
      });
    }
    this.entities.set(key, { ...entity, etag: `etag-${++this.version}` });
  }
}

const record: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-repo-1",
  communicationId: "communication-1",
  visitorId: "visitor-repo-1",
  channel: "email",
  state: "requested",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "Exact subject",
  body: "Exact body\nSecond line",
  recipientEmail: "visitor@example.org",
  eligibility: {
    phase5Enabled: true,
    contactConsent: true,
    emailPreference: "granted"
  },
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};

async function run(): Promise<void> {
  const table = new FakeTable();
  const repository = new MinistryEmailDeliveriesRepository(async tableName => {
    assert.equal(tableName, MINISTRY_EMAIL_DELIVERIES_TABLE_NAME);
    return table;
  });

  assert.equal(await repository.getById(record.deliveryId), null);
  assert.equal(await repository.create(record), true);
  assert.equal(await repository.create(record), false);
  assert.deepEqual(
    await repository.getById(record.deliveryId),
    record
  );
  const storedEntity = [...table.entities.values()][0];
  assert.equal("etag" in JSON.parse(storedEntity.deliveryJson), false);
  assert.equal(table.entities.size, 1);

  const changed = { ...record, body: "Should not overwrite" };
  assert.equal(await repository.create(changed), false);
  assert.equal(await repository.create({ ...record, visitorId: "different-visitor" }), false);
  assert.deepEqual(
    await repository.getById(record.deliveryId),
    record
  );

  const versioned = await repository.readVersionedById(record.deliveryId);
  assert(versioned);
  assert.equal(versioned.version, "etag-1");
  assert.deepEqual(versioned.record, record);

  const accepted = {
    ...record,
    state: "provider_accepted" as const,
    provider: "sendgrid" as const,
    providerMessageId: "provider-message",
    providerAcceptedAt: "2026-10-03T12:01:00.000Z"
  };
  assert.equal(
    await repository.transitionIfVersion(accepted, versioned.version),
    true
  );
  assert.deepEqual(await repository.getById(record.deliveryId), accepted);
  assert.equal(
    await repository.transitionIfVersion(record, versioned.version),
    false,
    "a stale ETag must not overwrite a terminal record"
  );
  assert.deepEqual(await repository.getById(record.deliveryId), accepted);

  const secondRecord = { ...record, deliveryId: "delivery-repo-2" };
  assert.equal(await repository.create(secondRecord), true);
  const freshVersioned = await repository.readVersionedById(secondRecord.deliveryId);
  assert(freshVersioned);
  const failed = {
    ...secondRecord,
    state: "failed" as const,
    provider: "sendgrid" as const,
    failedAt: "2026-10-03T12:02:00.000Z",
    failureCode: "provider_unavailable"
  };
  assert.equal(
    await repository.transitionIfVersion(failed, freshVersioned.version),
    true
  );
  const failedVersioned = await repository.readVersionedById(secondRecord.deliveryId);
  assert(failedVersioned);
  const acceptedSecond = {
    ...secondRecord,
    state: "provider_accepted" as const,
    provider: "sendgrid" as const,
    providerMessageId: "stale-provider-message",
    providerAcceptedAt: "2026-10-03T12:03:00.000Z"
  };
  assert.equal(
    await repository.transitionIfVersion(acceptedSecond, freshVersioned.version),
    false,
    "a stale ETag must not overwrite a failed record"
  );
  assert.deepEqual(await repository.getById(secondRecord.deliveryId), failed);
  assert.equal(await repository.transitionIfVersion(record, "missing-version"), false);
  assert.equal(await repository.transitionIfVersion(accepted, "missing-version"), false);
  assert.equal(await repository.readVersionedById("missing-delivery"), null);
  assert.equal(table.entities.size, 2, "conditional replace must never create a record");

  const raceBase = { ...record, deliveryId: "delivery-race" };
  assert.equal(await repository.create(raceBase), true);
  const raceVersion = await repository.readVersionedById(raceBase.deliveryId);
  assert(raceVersion);
  const winningTerminal = {
    ...raceBase,
    state: "provider_accepted" as const,
    provider: "sendgrid" as const,
    providerMessageId: "winning-message",
    providerAcceptedAt: "2026-10-03T12:04:00.000Z"
  };
  table.beforeUpdate = () => {
    const key = "EMAIL_DELIVERIES::delivery-race";
    const current = table.entities.get(key);
    assert(current);
    table.entities.set(key, {
      ...current,
      deliveryJson: JSON.stringify(winningTerminal),
      etag: "etag-race-winner"
    });
  };
  assert.equal(
    await repository.transitionIfVersion({
      ...raceBase,
      state: "failed",
      provider: "sendgrid",
      failedAt: "2026-10-03T12:05:00.000Z",
      failureCode: "stale-failure"
    }, raceVersion.version),
    false,
    "an Azure-style 412 race must return false"
  );
  assert.deepEqual(await repository.getById(raceBase.deliveryId), winningTerminal);
  assert.equal(table.entities.size, 3);

  console.log("ministryEmailDeliveriesRepository.test.ts passed");
}

run();
