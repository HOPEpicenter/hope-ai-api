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
};

class FakeTable {
  readonly entities = new Map<string, Entity>();

  async createEntity(entity: Entity): Promise<void> {
    const key = `${entity.partitionKey}::${entity.rowKey}`;
    if (this.entities.has(key)) {
      throw Object.assign(new Error("Already exists"), {
        statusCode: 409,
        code: "EntityAlreadyExists"
      });
    }
    this.entities.set(key, entity);
  }

  async getEntity(partitionKey: string, rowKey: string): Promise<Entity> {
    const entity = this.entities.get(`${partitionKey}::${rowKey}`);
    if (!entity) {
      throw Object.assign(new Error("Not found"), {
        statusCode: 404,
        code: "ResourceNotFound"
      });
    }
    return entity;
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
  assert.equal(table.entities.size, 1);

  const changed = { ...record, body: "Should not overwrite" };
  assert.equal(await repository.create(changed), false);
  assert.equal(await repository.create({ ...record, visitorId: "different-visitor" }), false);
  assert.deepEqual(
    await repository.getById(record.deliveryId),
    record
  );

  console.log("ministryEmailDeliveriesRepository.test.ts passed");
}

run();
