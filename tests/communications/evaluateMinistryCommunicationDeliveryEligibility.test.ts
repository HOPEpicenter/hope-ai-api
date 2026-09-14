import assert from "node:assert/strict";
import { evaluateMinistryCommunicationDeliveryEligibility } from "../../src/services/communications/evaluateMinistryCommunicationDeliveryEligibility";

assert.deepEqual(
  evaluateMinistryCommunicationDeliveryEligibility({
    phase5Enabled: false,
    contactConsent: false,
    preferenceState: "denied"
  }),
  { allowed: false, reason: "PHASE5_COMMUNICATIONS_DISABLED" }
);

assert.deepEqual(
  evaluateMinistryCommunicationDeliveryEligibility({
    phase5Enabled: true,
    contactConsent: false,
    preferenceState: "granted"
  }),
  { allowed: false, reason: "CONTACT_CONSENT_REQUIRED" }
);

assert.deepEqual(
  evaluateMinistryCommunicationDeliveryEligibility({
    phase5Enabled: true,
    contactConsent: true,
    preferenceState: "denied"
  }),
  { allowed: false, reason: "CHANNEL_PREFERENCE_DENIED" }
);

assert.deepEqual(
  evaluateMinistryCommunicationDeliveryEligibility({
    phase5Enabled: true,
    contactConsent: true,
    preferenceState: "granted"
  }),
  { allowed: false, reason: "DELIVERY_PROVIDER_NOT_CONFIGURED" }
);

console.log("evaluateMinistryCommunicationDeliveryEligibility.test.ts passed");
