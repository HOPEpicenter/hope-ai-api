import type {
  KioskBootstrapOwnerTokenConfiguration
} from "../services/authorization/assessKioskBootstrapOwnerToken";

export type KioskBootstrapEnvironment =
  Readonly<Record<string, string | undefined>>;

export type KioskBootstrapConfiguration =
  | Readonly<{
      verificationConfigured: false;
      executionPermitted: false;
      staffCreationPermitted: false;
      approvalConsumptionPermitted: false;
    }>
  | Readonly<{
      verificationConfigured: true;
      verificationConfiguration:
        KioskBootstrapOwnerTokenConfiguration;
      executionPermitted: false;
      staffCreationPermitted: false;
      approvalConsumptionPermitted: false;
    }>;

const TENANT_ID =
  "783ef4b1-7e96-4a71-80dd-06865b015da9";

const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SCOPE =
  /^[A-Za-z][A-Za-z0-9._-]{2,127}$/;

const DISABLED = Object.freeze({
  verificationConfigured: false as const,
  executionPermitted: false as const,
  staffCreationPermitted: false as const,
  approvalConsumptionPermitted: false as const
});

export class KioskBootstrapConfigurationError extends Error {
  constructor() {
    super("KIOSK_BOOTSTRAP_CONFIGURATION_INVALID");
    this.name = "KioskBootstrapConfigurationError";
  }
}

function required(
  environment: KioskBootstrapEnvironment,
  name: string
): string {
  const value = environment[name];

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new KioskBootstrapConfigurationError();
  }

  return value;
}

function guid(
  environment: KioskBootstrapEnvironment,
  name: string
): string {
  const value = required(environment, name);

  if (!GUID.test(value)) {
    throw new KioskBootstrapConfigurationError();
  }

  return value;
}

/**
 * Configuration is for identity verification only.
 *
 * The trusted executor must own the environment argument.
 * Never pass caller-supplied HTTP request data to this function.
 *
 * Even a fully configured identity check cannot execute a
 * bootstrap, consume approval, or write Staff records.
 */
export function getKioskBootstrapOwnerAuthorizationConfiguration(
  environment: KioskBootstrapEnvironment = process.env
): KioskBootstrapConfiguration {
  const feature =
    environment.FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION;

  if (feature === undefined || feature === "") {
    return DISABLED;
  }

  if (feature === "false") {
    return DISABLED;
  }

  if (feature !== "true") {
    throw new KioskBootstrapConfigurationError();
  }

  const tenantId = guid(
    environment,
    "KIOSK_BOOTSTRAP_ENTRA_TENANT_ID"
  );

  if (tenantId !== TENANT_ID) {
    throw new KioskBootstrapConfigurationError();
  }

  const ownerObjectId = guid(
    environment,
    "KIOSK_BOOTSTRAP_OWNER_OBJECT_ID"
  );

  const allowedClientApplicationId = guid(
    environment,
    "KIOSK_BOOTSTRAP_CLIENT_APPLICATION_ID"
  );

  const audience = required(
    environment,
    "KIOSK_BOOTSTRAP_API_AUDIENCE"
  );

  if (
    audience.length > 256 ||
    /[\s\u0000-\u001f\u007f]/.test(audience) ||
    audience.toLowerCase() ===
      allowedClientApplicationId.toLowerCase() ||
    audience.toLowerCase() ===
      `api://${allowedClientApplicationId}`
  ) {
    throw new KioskBootstrapConfigurationError();
  }

  const requiredScope = required(
    environment,
    "KIOSK_BOOTSTRAP_REQUIRED_SCOPE"
  );

  if (!SCOPE.test(requiredScope)) {
    throw new KioskBootstrapConfigurationError();
  }

  return Object.freeze({
    verificationConfigured: true as const,
    verificationConfiguration: Object.freeze({
      tenantId,
      ownerObjectId,
      audience,
      requiredScope,
      allowedClientApplicationId
    }),
    executionPermitted: false as const,
    staffCreationPermitted: false as const,
    approvalConsumptionPermitted: false as const
  });
}