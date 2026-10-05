export function readMinistryEmailEventWebhookPublicKey(): string {
  return String(
    process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY ?? ""
  ).trim();
}