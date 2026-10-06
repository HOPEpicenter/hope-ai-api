import assert from "node:assert/strict";
import {
  isMinistryEmailDeliveryProvider,
  MINISTRY_EMAIL_DELIVERY_PROVIDERS,
  MINISTRY_EMAIL_DELIVERY_SCHEMA_VERSION,
  type MinistryEmailDeliveryEligibilitySnapshot,
  type MinistryEmailDeliveryProvider,
  type MinistryEmailDeliveryRecord,
  type MinistryEmailDeliveryState
} from "../../src/domain/communications/ministryEmailDeliveryContracts";
import type { MinistryCommunicationOutcome } from "../../src/domain/communications/phase5CommunicationContracts";
import type {
  MinistryEmailDeliveryResponseV1,
  RequestMinistryEmailDeliveryV1
} from "../../src/contracts/ministryCommunicationEndpoints.v1";

type AssertFalse<T extends false> = T;
type StaffSentIsNotDeliveryState = AssertFalse<
  "sent" extends MinistryEmailDeliveryState ? true : false
>;
type FinalDeliveryIsNotClaimed = AssertFalse<
  "delivered" extends MinistryEmailDeliveryState ? true : false
>;
type RequestDoesNotChooseRecipient = AssertFalse<
  "recipientEmail" extends keyof RequestMinistryEmailDeliveryV1 ? true : false
>;

const supportedProviders:
  MinistryEmailDeliveryProvider[] = [
    "resend", "sendgrid", "ses"
  ];

const eligibility: MinistryEmailDeliveryEligibilitySnapshot = {
  phase5Enabled: true,
  contactConsent: true,
  emailPreference: "granted"
};

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: MINISTRY_EMAIL_DELIVERY_SCHEMA_VERSION,
  deliveryId: "delivery-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "requested",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "Your next step",
  body: "Thank you for meeting with us.",
  recipientEmail: "canonical@example.org",
  eligibility,
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};

assert.equal(MINISTRY_EMAIL_DELIVERY_SCHEMA_VERSION, 1);
assert.equal(requested.deliveryId, "delivery-1");
assert.equal(requested.communicationId, "communication-1");
assert.equal(requested.visitorId, "visitor-1");
assert.equal(requested.channel, "email");
assert.equal(requested.subject, "Your next step");
assert.equal(requested.body, "Thank you for meeting with us.");
assert.equal(requested.recipientEmail, "canonical@example.org");
assert.deepEqual(requested.eligibility, eligibility);
assert.equal(requested.state, "requested");
assert.equal(requested.dispatchAttemptId, null);
assert.equal(requested.dispatchClaimedAt, null);
assert.equal("leaseExpiresAt" in requested, false);
assert.equal("retryAfter" in requested, false);
assert.equal(requested.providerAcceptedAt, null);
assert.equal(requested.providerMessageId, null);
assert.deepEqual(
  MINISTRY_EMAIL_DELIVERY_PROVIDERS,
  supportedProviders
);
assert.deepEqual(supportedProviders, [
  "resend", "sendgrid", "ses"
]);

for (const provider of supportedProviders) {
  assert.equal(
    isMinistryEmailDeliveryProvider(provider),
    true
  );
}
assert.equal(isMinistryEmailDeliveryProvider("mailgun"), false);
assert.equal(isMinistryEmailDeliveryProvider(null), false);

const accepted: MinistryEmailDeliveryRecord = {
  ...requested,
  state: "provider_accepted",
  provider: "sendgrid",
  providerMessageId: "provider-message-1",
  providerAcceptedAt: "2026-10-03T12:01:00.000Z",
  dispatchAttemptId: "attempt-contract-1",
  dispatchClaimedAt: "2026-10-03T12:00:30.000Z"
};
assert.equal(accepted.state, "provider_accepted");
assert.equal(accepted.provider, "sendgrid");
assert.equal(accepted.providerMessageId, "provider-message-1");
assert.equal(accepted.providerAcceptedAt, "2026-10-03T12:01:00.000Z");
assert.equal(accepted.dispatchAttemptId, "attempt-contract-1");

const failed: MinistryEmailDeliveryRecord = {
  ...requested,
  state: "failed",
  provider: "sendgrid",
  failedAt: "2026-10-03T12:02:00.000Z",
  failureCode: "provider_unavailable"
};
assert.equal(failed.state, "failed");
assert.equal(failed.failedAt, "2026-10-03T12:02:00.000Z");
assert.equal(failed.failureCode, "provider_unavailable");

const request: RequestMinistryEmailDeliveryV1 = {
  deliveryId: "delivery-2",
  communicationId: "communication-2",
  subject: "Approved subject",
  body: "Approved body"
};
assert.deepEqual(Object.keys(request).sort(), [
  "body",
  "communicationId",
  "deliveryId",
  "subject"
]);

const response: MinistryEmailDeliveryResponseV1 = { ok: true, delivery: requested };
assert.equal(response.ok, true);
assert.equal(response.delivery.deliveryId, requested.deliveryId);

const staffOutcome: MinistryCommunicationOutcome = "sent";
assert.equal(staffOutcome, "sent");
const staffSentIsNotDeliveryState: StaffSentIsNotDeliveryState = false;
assert.equal(staffSentIsNotDeliveryState, false);
const finalDeliveryIsNotClaimed: FinalDeliveryIsNotClaimed = false;
assert.equal(finalDeliveryIsNotClaimed, false);
const requestDoesNotChooseRecipient: RequestDoesNotChooseRecipient = false;
assert.equal(requestDoesNotChooseRecipient, false);

console.log("ministryEmailDeliveryContracts.test.ts passed");
