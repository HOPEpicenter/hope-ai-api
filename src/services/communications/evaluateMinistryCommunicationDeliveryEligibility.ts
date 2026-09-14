export type MinistryCommunicationDeliveryBlockReason =
  | "PHASE5_COMMUNICATIONS_DISABLED"
  | "CONTACT_CONSENT_REQUIRED"
  | "CHANNEL_PREFERENCE_DENIED"
  | "DELIVERY_PROVIDER_NOT_CONFIGURED";

export type MinistryCommunicationDeliveryEligibilityInput = {
  phase5Enabled: boolean;
  contactConsent: boolean;
  preferenceState: "granted" | "denied" | "unknown";
};

export type MinistryCommunicationDeliveryEligibility = {
  allowed: false;
  reason: MinistryCommunicationDeliveryBlockReason;
};

/**
 * Delivery remains deliberately unavailable until a separately approved provider
 * integration exists. This policy is backend-owned so future delivery code cannot
 * bypass the feature, consent, or preference boundary.
 */
export function evaluateMinistryCommunicationDeliveryEligibility(
  input: MinistryCommunicationDeliveryEligibilityInput
): MinistryCommunicationDeliveryEligibility {
  if (!input.phase5Enabled) {
    return { allowed: false, reason: "PHASE5_COMMUNICATIONS_DISABLED" };
  }

  if (!input.contactConsent) {
    return { allowed: false, reason: "CONTACT_CONSENT_REQUIRED" };
  }

  if (input.preferenceState === "denied") {
    return { allowed: false, reason: "CHANNEL_PREFERENCE_DENIED" };
  }

  return { allowed: false, reason: "DELIVERY_PROVIDER_NOT_CONFIGURED" };
}
