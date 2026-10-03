import assert from "node:assert/strict";
import { evaluateMinistryEmailDeliveryRequestReadiness } from "../../src/services/communications/evaluateMinistryEmailDeliveryRequestReadiness";

assert.deepEqual(
  evaluateMinistryEmailDeliveryRequestReadiness({
    phase5Enabled: false,
    contactConsent: true,
    preferenceState: "granted"
  }),
  { allowed: false, reason: "PHASE5_COMMUNICATIONS_DISABLED" }
);

assert.deepEqual(
  evaluateMinistryEmailDeliveryRequestReadiness({
    phase5Enabled: true,
    contactConsent: false,
    preferenceState: "granted"
  }),
  { allowed: false, reason: "CONTACT_CONSENT_REQUIRED" }
);

for (const preferenceState of ["unknown", "denied"] as const) {
  assert.deepEqual(
    evaluateMinistryEmailDeliveryRequestReadiness({
      phase5Enabled: true,
      contactConsent: true,
      preferenceState
    }),
    { allowed: false, reason: "EMAIL_PREFERENCE_REQUIRED" }
  );
}

assert.deepEqual(
  evaluateMinistryEmailDeliveryRequestReadiness({
    phase5Enabled: true,
    contactConsent: true,
    preferenceState: "granted"
  }),
  { allowed: true }
);

console.log("evaluateMinistryEmailDeliveryRequestReadiness.test.ts passed");
