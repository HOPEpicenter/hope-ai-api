import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import { dispatchMinistryEmailDelivery } from "../../src/services/communications/dispatchMinistryEmailDelivery";

const voided: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-voided-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "voided",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "Subject",
  body: "Body",
  recipientEmail: "canonical@example.org",
  eligibility: { phase5Enabled: true, contactConsent: true, emailPreference: "granted" },
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null,
  voidedAt: "2026-10-04T10:00:00.000Z",
  voidedBy: "admin-1",
  voidReason: "Corrupted characters"
};

async function run(): Promise<void> {
  let claims = 0;
  let providerCalls = 0;
  let recipientChecks = 0;
  const result = await dispatchMinistryEmailDelivery(voided.deliveryId, {
    repository: {
      readVersionedById: async () => ({ record: structuredClone(voided), version: "v1" }),
      claimIfVersion: async () => { claims += 1; return true; },
      transitionIfVersion: async () => { throw new Error("must not transition"); }
    },
    provider: { send: async () => { providerCalls += 1; throw new Error("must not send"); } },
    getFlags: () => ({ phase5Communications: true, ministryEmailProviderSending: true }),
    recipientAllowed: () => { recipientChecks += 1; return true; },
    createDispatchAttemptId: () => "attempt-1"
  });

  assert.deepEqual(result, {
    deliveryId: voided.deliveryId,
    status: "delivery_voided",
    reconciliationRequired: false
  });
  assert.equal(claims, 0);
  assert.equal(providerCalls, 0);
  assert.equal(recipientChecks, 0);

  console.log("dispatchMinistryEmailDeliveryVoided.test.ts passed");
}

run().catch(error => { console.error(error); process.exit(1); });
