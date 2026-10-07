/**
 * Independent contract for provider email delivery. Staff-recorded ministry
 * communication outcomes remain separate from provider delivery state.
 */
export const MINISTRY_EMAIL_DELIVERY_SCHEMA_VERSION = 1 as const;

/** provider_accepted records provider acceptance, not final recipient delivery. */
export type MinistryEmailDeliveryState =
  | "requested"
  | "dispatching"
  | "provider_accepted"
  | "failed"
  /** Permanent administrative quarantine; never dispatchable or retryable. */
  | "voided";

export const MINISTRY_EMAIL_DELIVERY_PROVIDERS = [
  "resend",
  "sendgrid",
  "ses"
] as const;

export type MinistryEmailDeliveryProvider =
  typeof MINISTRY_EMAIL_DELIVERY_PROVIDERS[number];

export function isMinistryEmailDeliveryProvider(
  value: unknown
): value is MinistryEmailDeliveryProvider {
  return typeof value === "string" &&
    (
      MINISTRY_EMAIL_DELIVERY_PROVIDERS as readonly string[]
    ).includes(value);
}

export type MinistryEmailDeliveryEligibilitySnapshot = {
  phase5Enabled: true;
  contactConsent: true;
  emailPreference: "granted";
};

export type MinistryEmailDeliveryRecord = {
  schemaVersion: typeof MINISTRY_EMAIL_DELIVERY_SCHEMA_VERSION;
  /** Idempotency identity for safely replaying this delivery attempt. */
  deliveryId: string;
  communicationId: string;
  visitorId: string;
  channel: "email";
  state: MinistryEmailDeliveryState;
  requestedAt: string;
  requestedBy: string;
  subject: string;
  body: string;
  /** Canonical backend-resolved recipient used for this delivery attempt. */
  recipientEmail: string;
  eligibility: MinistryEmailDeliveryEligibilitySnapshot;
  /**
   * Durable worker claim; retained for audit after terminal provider results.
   * Dispatching claims do not expire automatically and require explicit reconciliation.
   */
  dispatchAttemptId: string | null;
  dispatchClaimedAt: string | null;
  provider: MinistryEmailDeliveryProvider | null;
  providerMessageId: string | null;
  providerAcceptedAt: string | null;
  failedAt: string | null;
  /** Provider failures are delivery state, not MinistryCommunicationOutcome values. */
  failureCode: string | null;
  /**
   * Void audit metadata. Optional so existing schema-version-1 records remain
   * valid; present only on voided records.
   */
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
};
