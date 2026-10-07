import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord, MinistryEmailDeliveryState } from "../../src/domain/communications/ministryEmailDeliveryContracts";

const states: MinistryEmailDeliveryState[] = ["requested", "dispatching", "provider_accepted", "failed", "voided"];
assert.deepEqual(states, ["requested", "dispatching", "provider_accepted", "failed", "voided"]);

// Legacy schema-version-1 records without void metadata remain valid.
const legacy: MinistryEmailDeliveryRecord = {
  schemaVersion: 1, deliveryId: "d", communicationId: "c", visitorId: "v", channel: "email",
  state: "requested", requestedAt: "2026-10-03T12:00:00.000Z", requestedBy: "s",
  subject: "s", body: "b", recipientEmail: "r@example.org",
  eligibility: { phase5Enabled: true, contactConsent: true, emailPreference: "granted" },
  dispatchAttemptId: null, dispatchClaimedAt: null, provider: null, providerMessageId: null,
  providerAcceptedAt: null, failedAt: null, failureCode: null
};
assert.equal("voidedAt" in legacy, false);

console.log("ministryEmailDeliveryVoidContract.test.ts passed");
