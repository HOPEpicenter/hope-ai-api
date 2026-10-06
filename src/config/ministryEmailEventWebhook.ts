export function readMinistryEmailEventWebhookPublicKey(): string {
  return String(
    process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY ?? ""
  ).trim();
}

export function readResendMinistryEmailEventWebhookSigningSecret(): string {
  return String(
    process.env.RESEND_EVENT_WEBHOOK_SIGNING_SECRET ?? ""
  ).trim();
}
