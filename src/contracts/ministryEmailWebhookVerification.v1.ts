export type VerifySendGridEventWebhookInput = {
  rawBody: Buffer | string;
  signature: string;
  timestamp: string;
  publicKey: string;
};

export type VerifySendGridEventWebhookResult =
  | {
      ok: true;
      signatureVerified: true;
    }
  | {
      ok: false;
      code:
        | "INVALID_WEBHOOK_VERIFICATION_INPUT"
        | "INVALID_WEBHOOK_PUBLIC_KEY"
        | "INVALID_WEBHOOK_SIGNATURE"
        | "WEBHOOK_VERIFICATION_FAILED";
    };
export type VerifyResendEventWebhookInput = {
  rawBody: Buffer | string;
  messageId: string;
  timestamp: string;
  signature: string;
  signingSecret: string;
};

export type VerifyResendEventWebhookResult =
  | {
      ok: true;
      signatureVerified: true;
    }
  | {
      ok: false;
      code:
        | "INVALID_WEBHOOK_VERIFICATION_INPUT"
        | "INVALID_WEBHOOK_SIGNING_SECRET"
        | "INVALID_WEBHOOK_TIMESTAMP"
        | "INVALID_WEBHOOK_SIGNATURE"
        | "WEBHOOK_VERIFICATION_FAILED";
    };
