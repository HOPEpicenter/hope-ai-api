export type ResendEmailSenderConfig = {
  apiKey: string;
  from: string;
};

/**
 * Reads Resend sender configuration without choosing or invoking a provider.
 *
 * Missing configuration fails closed. This reader performs no provider call,
 * Azure mutation, webhook registration, or email send.
 */
export function readResendEmailSenderConfig():
ResendEmailSenderConfig | null {
  const apiKey = String(
    process.env.RESEND_API_KEY ?? ""
  ).trim();

  const from = String(
    process.env.RESEND_FROM ?? ""
  ).trim();

  if (!apiKey || !from) {
    return null;
  }

  return {
    apiKey,
    from
  };
}