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

export type VerifiedSendGridProviderAcceptanceEvidence =
  Extract<
    MinistryEmailDispatchRecoveryEvidence,
    { kind: "provider_accepted" }
  > & {
    source: "verified_provider_event";
  };

export type NormalizeSendGridProviderEventResult =
  | {
      ok: true;
      eventType: SendGridAcceptanceEventType;
      evidence: VerifiedSendGridProviderAcceptanceEvidence;
    }
  | {
      ok: false;
      code:
        | "UNVERIFIED_PROVIDER_EVENT"
        | "INVALID_PROVIDER_EVENT"
        | "UNSUPPORTED_PROVIDER_EVENT"
        | "PROVIDER_EVENT_CORRELATION_MISMATCH";
    };
export const RESEND_DELIVERY_ID_TAG =
  "hope_delivery_id" as const;

export const RESEND_DISPATCH_ATTEMPT_ID_TAG =
  "hope_dispatch_attempt_id" as const;

export const RESEND_DELIVERY_EVIDENCE_EVENT_TYPES = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed"
] as const;

export type ResendDeliveryEvidenceEventType =
  typeof RESEND_DELIVERY_EVIDENCE_EVENT_TYPES[number];

export type ResendProviderEventProvenance = {
  signatureVerified: boolean;
};

export type NormalizeResendProviderEventInput = {
  expectedDeliveryId: string;
  expectedDispatchAttemptId: string;
  evidenceId: string;
  provenance: ResendProviderEventProvenance;
  event: unknown;
};

export type VerifiedResendProviderAcceptanceEvidence =
  Extract<
    MinistryEmailDispatchRecoveryEvidence,
    { kind: "provider_accepted" }
  > & {
    source: "verified_provider_event";
  };

export type NormalizeResendProviderEventResult =
  | {
      ok: true;
      eventType: ResendDeliveryEvidenceEventType;
      evidence: VerifiedResendProviderAcceptanceEvidence;
    }
  | {
      ok: false;
      code:
        | "UNVERIFIED_PROVIDER_EVENT"
        | "INVALID_PROVIDER_EVENT"
        | "UNSUPPORTED_PROVIDER_EVENT"
        | "PROVIDER_EVENT_CORRELATION_MISMATCH";
    };
