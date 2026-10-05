import type {
  MinistryEmailDispatchRecoveryEvidence
} from "./ministryEmailDispatchRecovery.v1";

export const SENDGRID_DELIVERY_ID_ARGUMENT =
  "hope_delivery_id" as const;

export const SENDGRID_DISPATCH_ATTEMPT_ID_ARGUMENT =
  "hope_dispatch_attempt_id" as const;

export const SENDGRID_ACCEPTANCE_EVENT_TYPES = [
  "processed",
  "delivered",
  "deferred",
  "bounce",
  "dropped"
] as const;

export type SendGridAcceptanceEventType =
  typeof SENDGRID_ACCEPTANCE_EVENT_TYPES[number];

export type SendGridProviderEventProvenance = {
  signatureVerified: boolean;
};

export type NormalizeSendGridProviderEventInput = {
  expectedDeliveryId: string;
  expectedDispatchAttemptId: string;
  provenance: SendGridProviderEventProvenance;
  event: unknown;
};

export type NormalizeSendGridProviderEventResult =
  | {
      ok: true;
      eventType: SendGridAcceptanceEventType;
      evidence: Extract<
        MinistryEmailDispatchRecoveryEvidence,
        { kind: "provider_accepted" }
      >;
    }
  | {
      ok: false;
      code:
        | "UNVERIFIED_PROVIDER_EVENT"
        | "INVALID_PROVIDER_EVENT"
        | "UNSUPPORTED_PROVIDER_EVENT"
        | "PROVIDER_EVENT_CORRELATION_MISMATCH";
    };