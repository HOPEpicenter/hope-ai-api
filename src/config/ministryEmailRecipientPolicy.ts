export const MINISTRY_EMAIL_RECIPIENT_POLICIES = [
  "deny_all",
  "allowlist",
  "all"
] as const;

export type MinistryEmailRecipientPolicy =
  typeof MINISTRY_EMAIL_RECIPIENT_POLICIES[number];

export type MinistryEmailRecipientPolicyConfig = {
  policy: MinistryEmailRecipientPolicy;
  allowedRecipients: ReadonlySet<string>;
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isExactEmailAddress(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 512 &&
    !value.includes("*") &&
    /^[^@\s,]+@[^@\s,]+$/.test(value)
  );
}

function readPolicy(value: unknown): MinistryEmailRecipientPolicy {
  const normalized =
    String(value ?? "").trim().toLowerCase();

  return (
    MINISTRY_EMAIL_RECIPIENT_POLICIES as readonly string[]
  ).includes(normalized)
    ? normalized as MinistryEmailRecipientPolicy
    : "deny_all";
}

export function readMinistryEmailRecipientPolicy(
  env: NodeJS.ProcessEnv = process.env
): MinistryEmailRecipientPolicyConfig {
  const policy =
    readPolicy(env.MINISTRY_EMAIL_RECIPIENT_POLICY);

  const allowedRecipients = new Set(
    String(
      env.MINISTRY_EMAIL_ALLOWED_RECIPIENTS ?? ""
    )
      .split(",")
      .map(normalizeEmail)
      .filter(isExactEmailAddress)
  );

  return {
    policy,
    allowedRecipients
  };
}

export function isMinistryEmailRecipientAllowed(
  recipientEmail: string,
  config:
    MinistryEmailRecipientPolicyConfig =
      readMinistryEmailRecipientPolicy()
): boolean {
  const normalized =
    normalizeEmail(recipientEmail);

  if (!isExactEmailAddress(normalized)) {
    return false;
  }

  if (config.policy === "all") {
    return true;
  }

  if (config.policy === "allowlist") {
    return config.allowedRecipients.has(normalized);
  }

  return false;
}
