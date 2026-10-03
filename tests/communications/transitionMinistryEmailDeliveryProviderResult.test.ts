import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import type { MinistryEmailProviderResult } from "../../src/services/communications/ministryEmailDeliveryProvider";
import {
  transitionMinistryEmailDeliveryProviderResult,
  MinistryEmailDeliveryTransitionError
} from "../../src/services/communications/transitionMinistryEmailDeliveryProviderResult";

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "requested",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "Approved subject",
  body: "Approved body\nKeep exact content",
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
const dispatching: MinistryEmailDeliveryRecord = {
  ...requested,
  state: "dispatching",
  dispatchAttemptId: "attempt-1",
  dispatchClaimedAt: "2026-10-03T12:00:30.000Z"
};

const occurredAt = "2026-10-03T12:01:00.000Z";

function assertRequestFieldsPreserved(record: MinistryEmailDeliveryRecord): void {
  for (const field of [
    "schemaVersion",
    "deliveryId",
    "communicationId",
    "visitorId",
    "channel",
    "requestedBy",
    "requestedAt",
    "subject",
    "body",
    "recipientEmail"
  ] as const) {
    assert.deepEqual(record[field], requested[field], `${field} must remain immutable`);
  }
  assert.deepEqual(record.eligibility, requested.eligibility);
  assert.equal(record.dispatchAttemptId, dispatching.dispatchAttemptId);
  assert.equal(record.dispatchClaimedAt, dispatching.dispatchClaimedAt);
  assert.equal("outcome" in record, false);
}

function expectTransitionError(action: () => unknown): void {
  assert.throws(action, MinistryEmailDeliveryTransitionError);
}

const acceptedResult: MinistryEmailProviderResult = {
  accepted: true,
  provider: "sendgrid",
  providerMessageId: "provider-message-1"
};
const accepted = transitionMinistryEmailDeliveryProviderResult(
  dispatching,
  acceptedResult,
  occurredAt
);
assert.equal(accepted.state, "provider_accepted");
assert.equal(accepted.provider, "sendgrid");
assert.equal(accepted.providerMessageId, "provider-message-1");
assert.equal(accepted.providerAcceptedAt, occurredAt);
assert.equal(accepted.failedAt, null);
assert.equal(accepted.failureCode, null);
assert.equal(accepted.dispatchAttemptId, dispatching.dispatchAttemptId);
assert.equal(accepted.dispatchClaimedAt, dispatching.dispatchClaimedAt);
assert.notEqual(accepted.state, "delivered");
assertRequestFieldsPreserved(accepted);

const failedResult: MinistryEmailProviderResult = {
  accepted: false,
  provider: "sendgrid",
  failureCode: "provider_unavailable"
};
const failed = transitionMinistryEmailDeliveryProviderResult(
  dispatching,
  failedResult,
  occurredAt
);
assert.equal(failed.state, "failed");
assert.equal(failed.provider, "sendgrid");
assert.equal(failed.failureCode, "provider_unavailable");
assert.equal(failed.failedAt, occurredAt);
assert.equal(failed.providerMessageId, null);
assert.equal(failed.providerAcceptedAt, null);
assert.equal(failed.dispatchAttemptId, dispatching.dispatchAttemptId);
assert.equal(failed.dispatchClaimedAt, dispatching.dispatchClaimedAt);
assertRequestFieldsPreserved(failed);

assert.deepEqual(
  transitionMinistryEmailDeliveryProviderResult(
    accepted,
    acceptedResult,
    "2026-10-03T12:09:00.000Z"
  ),
  accepted,
  "identical acceptance replay should be unchanged"
);
assert.deepEqual(
  transitionMinistryEmailDeliveryProviderResult(
    failed,
    failedResult,
    "2026-10-03T12:09:00.000Z"
  ),
  failed,
  "identical failure replay should be unchanged"
);

expectTransitionError(() =>
  transitionMinistryEmailDeliveryProviderResult(
    accepted,
    { ...acceptedResult, providerMessageId: "different-message" },
    occurredAt
  )
);
expectTransitionError(() =>
  transitionMinistryEmailDeliveryProviderResult(
    failed,
    { ...failedResult, failureCode: "different_failure" },
    occurredAt
  )
);
expectTransitionError(() =>
  transitionMinistryEmailDeliveryProviderResult(accepted, failedResult, occurredAt)
);
expectTransitionError(() =>
  transitionMinistryEmailDeliveryProviderResult(failed, acceptedResult, occurredAt)
);
expectTransitionError(() =>
  transitionMinistryEmailDeliveryProviderResult(requested, acceptedResult, occurredAt)
);
expectTransitionError(() =>
  transitionMinistryEmailDeliveryProviderResult(requested, failedResult, occurredAt)
);

console.log("transitionMinistryEmailDeliveryProviderResult.test.ts passed");
