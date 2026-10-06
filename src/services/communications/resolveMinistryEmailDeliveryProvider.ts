import {
  readMinistryEmailProviderSelection
} from "../../config/ministryEmailProviderSelection";
import {
  readResendEmailSenderConfig,
  type ResendEmailSenderConfig
} from "../../config/resendEmailSender";
import type {
  MinistryEmailDeliveryProvider
} from "../../domain/communications/ministryEmailDeliveryContracts";
import type {
  MinistryEmailDeliveryProviderAdapter
} from "./ministryEmailDeliveryProvider";
import {
  ResendMinistryEmailDeliveryProvider
} from "./resendMinistryEmailDeliveryProvider";

export type ResolveMinistryEmailDeliveryProviderResult =
  | {
      ok: true;
      provider: MinistryEmailDeliveryProviderAdapter;
    }
  | {
      ok: false;
      code:
        | "MINISTRY_EMAIL_PROVIDER_NOT_CONFIGURED"
        | "MINISTRY_EMAIL_PROVIDER_NOT_IMPLEMENTED"
        | "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE";
    };

export type ResolveMinistryEmailDeliveryProviderDependencies = {
  readProviderSelection?: () =>
    MinistryEmailDeliveryProvider | null;
  readResendConfig?: () =>
    ResendEmailSenderConfig | null;
  createResendProvider?: (
    config: ResendEmailSenderConfig
  ) => MinistryEmailDeliveryProviderAdapter;
};

/**
 * Resolves the one configured ministry email provider.
 *
 * This factory performs no send, delivery persistence, retry, recovery
 * resolution, ministry outcome mutation, or Six-Week mutation.
 */
export function resolveMinistryEmailDeliveryProvider(
  dependencies:
    ResolveMinistryEmailDeliveryProviderDependencies = {}
): ResolveMinistryEmailDeliveryProviderResult {
  let selected:
    MinistryEmailDeliveryProvider |
    null;

  try {
    selected = (
      dependencies.readProviderSelection ??
      readMinistryEmailProviderSelection
    )();
  }
  catch {
    return {
      ok: false,
      code:
        "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE"
    };
  }

  if (!selected) {
    return {
      ok: false,
      code:
        "MINISTRY_EMAIL_PROVIDER_NOT_CONFIGURED"
    };
  }

  if (selected !== "resend") {
    return {
      ok: false,
      code:
        "MINISTRY_EMAIL_PROVIDER_NOT_IMPLEMENTED"
    };
  }

  let config:
    ResendEmailSenderConfig |
    null;

  try {
    config = (
      dependencies.readResendConfig ??
      readResendEmailSenderConfig
    )();
  }
  catch {
    return {
      ok: false,
      code:
        "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE"
    };
  }

  if (!config) {
    return {
      ok: false,
      code:
        "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE"
    };
  }

  try {
    const provider = (
      dependencies.createResendProvider ??
      (
        (
          value:
            ResendEmailSenderConfig
        ) =>
          new ResendMinistryEmailDeliveryProvider(
            value
          )
      )
    )(config);

    return {
      ok: true,
      provider
    };
  }
  catch {
    return {
      ok: false,
      code:
        "MINISTRY_EMAIL_PROVIDER_CONFIGURATION_UNAVAILABLE"
    };
  }
}