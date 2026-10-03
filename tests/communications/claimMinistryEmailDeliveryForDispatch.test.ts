import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import {
  claimMinistryEmailDeliveryForDispatch,
  MinistryEmailDeliveryClaimError
} from "../../src/services/communications/claimMinistryEmailDeliveryForDispatch";

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-claim-1",
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

const attemptId = "dispatch-attempt-1";
const claimedAt = "2026-10-03T12:10:00.000Z";

function assertRequestFieldsPreserved(record: MinistryEmailDeliveryRecord): void {
  assert.equal(record.schemaVersion, requested.schemaVersion);
  assert.equal(record.deliveryId, requested.deliveryId);
  assert.equal(record.communicationId, requested.communicationId);
  assert.equal(record.visitorId, requested.visitorId);
  assert.equal(record.channel, requested.channel);
  assert.equal(record.requestedAt, requested.requestedAt);
  assert.equal(record.requestedBy, requested.requestedBy);
  assert.equal(record.subject, requested.subject);
  assert.equal(record.body, requested.body);
  assert.equal(record.recipientEmail, requested.recipientEmail);
  assert.deepEqual(record.eligibility, requested.eligibility);
}

const dispatching = claimMinistryEmailDeliveryForDispatch(
  requested,
  attemptId,
  claimedAt
);
assert.equal(dispatching.state, "dispatching");
assert.equal(dispatching.dispatchAttemptId, attemptId);
assert.equal(dispatching.dispatchClaimedAt, claimedAt);
assert.equal(dispatching.provider, null);
assert.equal(dispatching.providerMessageId, null);
assert.equal(dispatching.providerAcceptedAt, null);
assert.equal(dispatching.failedAt, null);
assert.equal(dispatching.failureCode, null);
assertRequestFieldsPreserved(dispatching);

assert.deepEqual(
  claimMinistryEmailDeliveryForDispatch(dispatching, attemptId, claimedAt),
  dispatching
);

for (const [record, id, timestamp] of [
  [requested, "", claimedAt],
  [requested, "  ", claimedAt],
  [requested, attemptId, ""],
  [requested, attemptId, "  "],
  [requested, attemptId, "not-a-timestamp"],
  [dispatching, "different-attempt", claimedAt],
  [dispatching, attemptId, "2026-10-03T12:11:00.000Z"],
  [{ ...requested, dispatchAttemptId: "unexpected", dispatchClaimedAt: null }, attemptId, claimedAt],
  [{ ...requested, dispatchAttemptId: null, dispatchClaimedAt: claimedAt }, attemptId, claimedAt],
  [{ ...dispatching, state: "provider_accepted" as const, provider: "sendgrid" as const, providerMessageId: "msg", providerAcceptedAt: claimedAt }, attemptId, claimedAt],
  [{ ...dispatching, state: "failed" as const, provider: "sendgrid" as const, failedAt: claimedAt, failureCode: "known_failure" }, attemptId, claimedAt]
] as const) {
  assert.throws(
    () => claimMinistryEmailDeliveryForDispatch(record, id, timestamp),
    MinistryEmailDeliveryClaimError
  );
}

console.log("claimMinistryEmailDeliveryForDispatch.test.ts passed");
