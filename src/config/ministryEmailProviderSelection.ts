import {
  isMinistryEmailDeliveryProvider,
  type MinistryEmailDeliveryProvider
} from "../domain/communications/ministryEmailDeliveryContracts";

export function parseMinistryEmailProvider(
  value: unknown
): MinistryEmailDeliveryProvider | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  return isMinistryEmailDeliveryProvider(normalized)
    ? normalized
    : null;
}

/**
 * Missing or invalid configuration deliberately resolves to no provider.
 * Runtime callers must fail closed rather than silently choosing a provider.
 */
export function readMinistryEmailProviderSelection():
MinistryEmailDeliveryProvider | null {
  return parseMinistryEmailProvider(
    process.env.MINISTRY_EMAIL_PROVIDER
  );
}
