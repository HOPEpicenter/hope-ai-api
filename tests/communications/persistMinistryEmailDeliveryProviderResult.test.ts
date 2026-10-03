import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import type { MinistryEmailProviderResult } from "../../src/services/communications/ministryEmailDeliveryProvider";
import {
  persistMinistryEmailDeliveryProviderResult,
  MinistryEmailDeliveryPersistenceError,
  type VersionedMinistryEmailDeliveryRepository
} from "../../src/services/communications/persistMinistryEmailDeliveryProviderResult";

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-persist-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "requested",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "Approved subject",
  body: "Approved body",
  recipientEmail: "canonical@example.org",
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

const acceptedResult: MinistryEmailProviderResult = {
  accepted: true,
  provider: "sendgrid",
  providerMessageId: "provider-message-1"
};
const failedResult: MinistryEmailProviderResult = {
  accepted: false,
  provider: "sendgrid",
  failureCode: "provider_unavailable"
};

class FakeRepository implements VersionedMinistryEmailDeliveryRepository {
  current: MinistryEmailDeliveryRecord | null = structuredClone(requested);
  version = 1;
  loseNextWrite: ((next: MinistryEmailDeliveryRecord) => void) | null = null;
  writes = 0;

  async readVersionedById(): Promise<{ record: MinistryEmailDeliveryRecord; version: string } | null> {
    return this.current
      ? { record: structuredClone(this.current), version: `v${this.version}` }
      : null;
  }

  async transitionIfVersion(
    next: MinistryEmailDeliveryRecord,
    expectedVersion: string
  ): Promise<boolean> {
    this.writes += 1;
    if (this.loseNextWrite) {
      const race = this.loseNextWrite;
      this.loseNextWrite = null;
      race(next);
      return false;
    }
    if (!this.current || expectedVersion !== `v${this.version}`) return false;
    this.current = structuredClone(next);
    this.version += 1;
    return true;
  }
}

function terminalFrom(
  result: MinistryEmailProviderResult,
  timestamp: string
): MinistryEmailDeliveryRecord {
  if (result.accepted) {
    return {
      ...requested,
      state: "provider_accepted",
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      providerAcceptedAt: timestamp
    };
  }
  return {
    ...requested,
    state: "failed",
    provider: result.provider,
    failedAt: timestamp,
    failureCode: result.failureCode
  };
}

function assertPersistenceError(
  error: unknown,
  code: "DELIVERY_NOT_FOUND" | "DELIVERY_TRANSITION_CONFLICT"
): void {
  assert(error instanceof MinistryEmailDeliveryPersistenceError);
  assert.equal(error.code, code);
}

async function run(): Promise<void> {
  const acceptedRepository = new FakeRepository();
  const accepted = await persistMinistryEmailDeliveryProviderResult(
    requested.deliveryId,
    acceptedResult,
    "2026-10-03T12:01:00.000Z",
    { repository: acceptedRepository }
  );
  assert.equal(accepted.state, "provider_accepted");
  assert.equal(acceptedRepository.current?.state, "provider_accepted");

  const failedRepository = new FakeRepository();
  const failed = await persistMinistryEmailDeliveryProviderResult(
    requested.deliveryId,
    failedResult,
    "2026-10-03T12:02:00.000Z",
    { repository: failedRepository }
  );
  assert.equal(failed.state, "failed");
  assert.equal(failedRepository.current?.state, "failed");

  const replayRepository = new FakeRepository();
  replayRepository.loseNextWrite = () => {
    replayRepository.current = terminalFrom(
      acceptedResult,
      "2026-10-03T12:01:00.000Z"
    );
    replayRepository.version += 1;
  };
  const concurrentReplay = await persistMinistryEmailDeliveryProviderResult(
    requested.deliveryId,
    acceptedResult,
    "2026-10-03T12:09:00.000Z",
    { repository: replayRepository }
  );
  assert.equal(concurrentReplay.state, "provider_accepted");
  assert.equal(
    concurrentReplay.providerAcceptedAt,
    "2026-10-03T12:01:00.000Z",
    "identical replay returns the winning record unchanged"
  );

  const conflictRepository = new FakeRepository();
  conflictRepository.loseNextWrite = () => {
    conflictRepository.current = terminalFrom(
      failedResult,
      "2026-10-03T12:02:00.000Z"
    );
    conflictRepository.version += 1;
  };
  await assert.rejects(
    persistMinistryEmailDeliveryProviderResult(
      requested.deliveryId,
      acceptedResult,
      "2026-10-03T12:01:00.000Z",
      { repository: conflictRepository }
    ),
    error => {
      assertPersistenceError(error, "DELIVERY_TRANSITION_CONFLICT");
      return true;
    }
  );
  assert.equal(conflictRepository.current?.state, "failed");

  const missingRepository = new FakeRepository();
  missingRepository.current = null;
  await assert.rejects(
    persistMinistryEmailDeliveryProviderResult(
      requested.deliveryId,
      acceptedResult,
      "2026-10-03T12:01:00.000Z",
      { repository: missingRepository }
    ),
    error => {
      assertPersistenceError(error, "DELIVERY_NOT_FOUND");
      return true;
    }
  );
  assert.equal(missingRepository.writes, 0, "a missing record is never created");

  const communicationEvents = [{ type: "existing-communication-event" }];
  const sixWeekEvents = [{ type: "existing-six-week-event" }];
  const communicationBefore = structuredClone(communicationEvents);
  const sixWeekBefore = structuredClone(sixWeekEvents);
  await persistMinistryEmailDeliveryProviderResult(
    requested.deliveryId,
    acceptedResult,
    "2026-10-03T12:01:00.000Z",
    { repository: new FakeRepository() }
  );
  assert.deepEqual(communicationEvents, communicationBefore);
  assert.deepEqual(sixWeekEvents, sixWeekBefore);

  console.log("persistMinistryEmailDeliveryProviderResult.test.ts passed");
}

run();
