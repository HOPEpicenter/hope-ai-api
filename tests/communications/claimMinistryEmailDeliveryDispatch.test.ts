import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import {
  claimMinistryEmailDeliveryDispatch,
  MinistryEmailDeliveryClaimPersistenceError,
  type VersionedMinistryEmailDeliveryClaimRepository
} from "../../src/services/communications/claimMinistryEmailDeliveryDispatch";

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-claim-persist",
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
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};

class FakeRepository implements VersionedMinistryEmailDeliveryClaimRepository {
  current: MinistryEmailDeliveryRecord | null = structuredClone(requested);
  version = 1;
  onClaimConflict: (() => void) | null = null;
  writes = 0;

  async readVersionedById(): Promise<{ record: MinistryEmailDeliveryRecord; version: string } | null> {
    return this.current
      ? { record: structuredClone(this.current), version: `v${this.version}` }
      : null;
  }

  async claimIfVersion(
    next: MinistryEmailDeliveryRecord,
    version: string
  ): Promise<boolean> {
    this.writes += 1;
    if (this.onClaimConflict) {
      const conflict = this.onClaimConflict;
      this.onClaimConflict = null;
      conflict();
      return false;
    }
    if (!this.current || version !== `v${this.version}`) return false;
    this.current = structuredClone(next);
    this.version += 1;
    return true;
  }
}

function expectClaimError(
  error: unknown,
  code: "DELIVERY_NOT_FOUND" | "DELIVERY_DISPATCH_ALREADY_CLAIMED" | "DELIVERY_TRANSITION_CONFLICT"
): void {
  assert(error instanceof MinistryEmailDeliveryClaimPersistenceError);
  assert.equal(error.code, code);
}

async function run(): Promise<void> {
  const repository = new FakeRepository();
  const claimed = await claimMinistryEmailDeliveryDispatch(
    requested.deliveryId,
    "attempt-1",
    "2026-10-03T12:10:00.000Z",
    { repository }
  );
  assert.equal(claimed.acquired, true);
  assert.equal(claimed.delivery.state, "dispatching");
  assert.equal(claimed.delivery.dispatchAttemptId, "attempt-1");
  assert.equal(repository.writes, 1);

  const replay = await claimMinistryEmailDeliveryDispatch(
    requested.deliveryId,
    "attempt-1",
    "2026-10-03T12:10:00.000Z",
    { repository }
  );
  assert.equal(replay.acquired, false);
  assert.deepEqual(replay.delivery, claimed.delivery);
  assert.equal(repository.writes, 1, "identical claim replay performs no write");

  await assert.rejects(
    claimMinistryEmailDeliveryDispatch(
      requested.deliveryId,
      "attempt-2",
      "2026-10-03T12:11:00.000Z",
      { repository }
    ),
    error => {
      expectClaimError(error, "DELIVERY_DISPATCH_ALREADY_CLAIMED");
      return true;
    }
  );

  const raceReplay = new FakeRepository();
  raceReplay.onClaimConflict = () => {
    raceReplay.current = {
      ...requested,
      state: "dispatching",
      dispatchAttemptId: "same-attempt",
      dispatchClaimedAt: "2026-10-03T12:12:00.000Z"
    };
    raceReplay.version += 1;
  };
  const wonBySameAttempt = await claimMinistryEmailDeliveryDispatch(
    requested.deliveryId,
    "same-attempt",
    "2026-10-03T12:12:00.000Z",
    { repository: raceReplay }
  );
  assert.equal(wonBySameAttempt.acquired, false);
  assert.equal(wonBySameAttempt.delivery.state, "dispatching");
  assert.equal(wonBySameAttempt.delivery.dispatchAttemptId, "same-attempt");

  const raceStillRequested = new FakeRepository();
  raceStillRequested.onClaimConflict = () => {
    raceStillRequested.version += 1;
  };
  await assert.rejects(
    claimMinistryEmailDeliveryDispatch(
      requested.deliveryId,
      "attempt-never-persisted",
      "2026-10-03T12:12:30.000Z",
      { repository: raceStillRequested }
    ),
    error => {
      expectClaimError(error, "DELIVERY_TRANSITION_CONFLICT");
      return true;
    }
  );
  assert.equal(raceStillRequested.current?.state, "requested");

  const raceDifferent = new FakeRepository();
  raceDifferent.onClaimConflict = () => {
    raceDifferent.current = {
      ...requested,
      state: "dispatching",
      dispatchAttemptId: "winner",
      dispatchClaimedAt: "2026-10-03T12:13:00.000Z"
    };
    raceDifferent.version += 1;
  };
  await assert.rejects(
    claimMinistryEmailDeliveryDispatch(
      requested.deliveryId,
      "loser",
      "2026-10-03T12:14:00.000Z",
      { repository: raceDifferent }
    ),
    error => {
      expectClaimError(error, "DELIVERY_DISPATCH_ALREADY_CLAIMED");
      return true;
    }
  );

  const missing = new FakeRepository();
  missing.current = null;
  await assert.rejects(
    claimMinistryEmailDeliveryDispatch(
      requested.deliveryId,
      "attempt",
      "2026-10-03T12:10:00.000Z",
      { repository: missing }
    ),
    error => {
      expectClaimError(error, "DELIVERY_NOT_FOUND");
      return true;
    }
  );
  assert.equal(missing.writes, 0);

  const terminal = new FakeRepository();
  terminal.current = {
    ...requested,
    state: "failed",
    dispatchAttemptId: "old-attempt",
    dispatchClaimedAt: "2026-10-03T12:09:00.000Z",
    provider: "sendgrid",
    failedAt: "2026-10-03T12:10:00.000Z",
    failureCode: "known_failure"
  };
  await assert.rejects(
    claimMinistryEmailDeliveryDispatch(
      requested.deliveryId,
      "new-attempt",
      "2026-10-03T12:11:00.000Z",
      { repository: terminal }
    ),
    error => {
      expectClaimError(error, "DELIVERY_TRANSITION_CONFLICT");
      return true;
    }
  );
  assert.equal(terminal.writes, 0);

  console.log("claimMinistryEmailDeliveryDispatch.test.ts passed");
}

run();
