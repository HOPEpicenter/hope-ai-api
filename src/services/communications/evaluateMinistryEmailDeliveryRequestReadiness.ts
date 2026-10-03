export type MinistryEmailDeliveryRequestReadinessInput = {
  phase5Enabled: boolean;
  contactConsent: boolean;
  preferenceState: "granted" | "denied" | "unknown";
};

export type MinistryEmailDeliveryRequestReadiness =
  | { allowed: true }
  | {
    allowed: false;
    reason:
      | "PHASE5_COMMUNICATIONS_DISABLED"
      | "CONTACT_CONSENT_REQUIRED"
      | "EMAIL_PREFERENCE_REQUIRED";
  };

/**
 * Evaluates permission to create a requested-state record only.
 * It does not establish provider availability or authorize email delivery.
 */
export function evaluateMinistryEmailDeliveryRequestReadiness(
  input: MinistryEmailDeliveryRequestReadinessInput
): MinistryEmailDeliveryRequestReadiness {
  if (!input.phase5Enabled) {
    return { allowed: false, reason: "PHASE5_COMMUNICATIONS_DISABLED" };
  }

  if (!input.contactConsent) {
    return { allowed: false, reason: "CONTACT_CONSENT_REQUIRED" };
  }

  if (input.preferenceState !== "granted") {
    return { allowed: false, reason: "EMAIL_PREFERENCE_REQUIRED" };
  }

  return { allowed: true };
}
