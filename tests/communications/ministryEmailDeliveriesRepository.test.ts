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
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
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
    false,
    "requested records cannot transition directly to provider terminal states"
  );

  const dispatching = {
    ...record,
    state: "dispatching" as const,
    dispatchAttemptId: "dispatch-attempt-1",
    dispatchClaimedAt: "2026-10-03T12:00:30.000Z"
  };
  assert.equal(
    await repository.claimIfVersion(dispatching, versioned.version),
    true
  );
  assert.deepEqual(await repository.getById(record.deliveryId), dispatching);
  assert.equal(
    await repository.claimIfVersion({
      ...dispatching,
      dispatchAttemptId: "attempt-2"
    }, versioned.version),
    false
  );

  const claimedVersion = await repository.readVersionedById(record.deliveryId);
  assert(claimedVersion);
  assert.notEqual(claimedVersion.version, versioned.version);
  const acceptedDispatch = {
    ...dispatching,
    state: "provider_accepted" as const,
    provider: "sendgrid" as const,
    providerMessageId: "provider-message",
    providerAcceptedAt: "2026-10-03T12:01:00.000Z"
  };
  assert.equal(
    await repository.transitionIfVersion(acceptedDispatch, claimedVersion.version),
    true
  );
  assert.deepEqual(await repository.getById(record.deliveryId), acceptedDispatch);
  assert.equal(
    await repository.transitionIfVersion(dispatching, claimedVersion.version),
    false,
    "a stale ETag must not overwrite a terminal record"
  );
  assert.deepEqual(await repository.getById(record.deliveryId), acceptedDispatch);
  const terminalVersion = await repository.readVersionedById(record.deliveryId);
  assert(terminalVersion);
  assert.equal(
    await repository.claimIfVersion(dispatching, terminalVersion.version),
    false,
    "terminal records cannot be claimed"
  );

  const secondRecord = { ...record, deliveryId: "delivery-repo-2" };
  assert.equal(await repository.create(secondRecord), true);
  const freshVersioned = await repository.readVersionedById(secondRecord.deliveryId);
  assert(freshVersioned);
  const secondDispatching = {
    ...secondRecord,
    state: "dispatching" as const,
    dispatchAttemptId: "dispatch-attempt-2",
    dispatchClaimedAt: "2026-10-03T12:01:30.000Z"
  };
  assert.equal(
    await repository.claimIfVersion(secondDispatching, freshVersioned.version),
    true
  );
  const secondClaimVersion = await repository.readVersionedById(secondRecord.deliveryId);
  assert(secondClaimVersion);
  const failed = {
    ...secondDispatching,
    state: "failed" as const,
    provider: "sendgrid" as const,
    failedAt: "2026-10-03T12:02:00.000Z",
    failureCode: "provider_unavailable"
  };
  assert.equal(
    await repository.transitionIfVersion(failed, secondClaimVersion.version),
    true
  );
  const failedVersioned = await repository.readVersionedById(secondRecord.deliveryId);
  assert(failedVersioned);
  const acceptedSecond = {
    ...secondDispatching,
    state: "provider_accepted" as const,
    provider: "sendgrid" as const,
    providerMessageId: "stale-provider-message",
    providerAcceptedAt: "2026-10-03T12:03:00.000Z"
  };
  assert.equal(
    await repository.transitionIfVersion(acceptedSecond, secondClaimVersion.version),
    false,
    "a stale ETag must not overwrite a failed record"
  );
  assert.deepEqual(await repository.getById(secondRecord.deliveryId), failed);
  assert.equal(
    await repository.transitionIfVersion({
      ...secondDispatching,
      state: "requested"
    }, failedVersioned.version),
    false,
    "dispatching records cannot be reset to requested"
  );
  assert.equal(await repository.claimIfVersion(dispatching, "missing-version"), false);
  assert.equal(await repository.transitionIfVersion(accepted, "missing-version"), false);
  assert.equal(await repository.readVersionedById("missing-delivery"), null);
  assert.equal(
    await repository.claimIfVersion({
      ...record,
      deliveryId: "missing-delivery",
      state: "dispatching",
      dispatchAttemptId: "attempt-missing",
      dispatchClaimedAt: "2026-10-03T12:05:00.000Z"
    }, "etag-missing"),
    false,
    "claim must not create a missing delivery"
  );
  assert.equal(table.entities.size, 2, "conditional replace must never create a record");

  const raceBase = { ...record, deliveryId: "delivery-race" };
  assert.equal(await repository.create(raceBase), true);
  const raceVersion = await repository.readVersionedById(raceBase.deliveryId);
  assert(raceVersion);
  const winningClaim = {
    ...raceBase,
    state: "dispatching" as const,
    dispatchAttemptId: "winning-attempt",
    dispatchClaimedAt: "2026-10-03T12:04:00.000Z"
  };
  table.beforeUpdate = () => {
    const key = "EMAIL_DELIVERIES::delivery-race";
    const current = table.entities.get(key);
    assert(current);
    table.entities.set(key, {
      ...current,
      deliveryJson: JSON.stringify(winningClaim),
      etag: "etag-race-winner"
    });
  };
  assert.equal(
    await repository.claimIfVersion({
      ...raceBase,
      state: "dispatching",
      dispatchAttemptId: "stale-attempt",
      dispatchClaimedAt: "2026-10-03T12:05:00.000Z"
    }, raceVersion.version),
    false,
    "an Azure-style 412 race must return false"
  );
  assert.deepEqual(await repository.getById(raceBase.deliveryId), winningClaim);
  assert.equal(table.entities.size, 3);

  const legacyRecord = { ...record, deliveryId: "delivery-legacy" };
  const legacyKey = "EMAIL_DELIVERIES::delivery-legacy";
  table.entities.set(legacyKey, {
    partitionKey: "EMAIL_DELIVERIES",
    rowKey: "delivery-legacy",
    deliveryJson: JSON.stringify((({ dispatchAttemptId: _attempt, dispatchClaimedAt: _at, ...legacy }) => legacy)(legacyRecord)),
    etag: "etag-legacy"
  });
  const normalizedLegacy = await repository.getById("delivery-legacy");
  assert(normalizedLegacy);
  assert.equal(normalizedLegacy.dispatchAttemptId, null);
  assert.equal(normalizedLegacy.dispatchClaimedAt, null);

  console.log("ministryEmailDeliveriesRepository.test.ts passed");
}

run();
