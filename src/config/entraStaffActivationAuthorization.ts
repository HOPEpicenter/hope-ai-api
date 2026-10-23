import type {
  EntraStaffTokenVerificationConfiguration
} from "../services/authorization/verifyEntraStaffAccessToken";
import {
  EntraStaffAuthorizationConfigurationError,
  type EntraStaffAuthorizationEnvironment
} from "./entraStaffAuthorization";

export type EntraStaffActivationAuthorizationConfiguration =
  | {
      enforcementEnabled: false;
    }
  | {
      enforcementEnabled: true;
      verificationConfiguration: EntraStaffTokenVerificationConfiguration;
    };

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PERMISSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

function required(
  environment: EntraStaffAuthorizationEnvironment,
  name: string
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new EntraStaffAuthorizationConfigurationError(
      `Required Entra activation setting is missing: ${name}`
    );
  }

  return value;
}

function guid(
  environment: EntraStaffAuthorizationEnvironment,
  name: string
): string {
  const value = required(environment, name);

  if (!GUID_PATTERN.test(value)) {
    throw new EntraStaffAuthorizationConfigurationError(
      `Entra activation setting must be a GUID: ${name}`
    );
  }

  return value.toLowerCase();
}

function permissions(
  environment: EntraStaffAuthorizationEnvironment,
  name: string
): string[] {
  const raw = environment[name]?.trim();

  if (!raw) {
    return [];
  }

  const values = raw.split(",").map(value => value.trim());

  if (
    values.some(value => !PERMISSION_PATTERN.test(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new EntraStaffAuthorizationConfigurationError(
      `Invalid Entra activation permissions: ${name}`
    );
  }

  return values;
}

export function getEntraStaffActivationAuthorizationConfiguration(
  environment: EntraStaffAuthorizationEnvironment = process.env
): EntraStaffActivationAuthorizationConfiguration {
  const feature =
    environment.FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION?.trim() ?? "";

  if (feature === "" || feature.toLowerCase() === "false") {
    return { enforcementEnabled: false };
  }

  if (feature.toLowerCase() !== "true") {
    throw new EntraStaffAuthorizationConfigurationError(
      "Invalid FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION setting"
    );
  }

  const tenantId = guid(environment, "HOPE_ENTRA_TENANT_ID");
  const audience = required(environment, "HOPE_ENTRA_API_AUDIENCE");
  const dashboardClientId = guid(
    environment,
    "AUTH_MICROSOFT_ENTRA_ID_ID"
  );

  if (
    /[\s\u0000-\u001f\u007f]/.test(audience) ||
    audience.toLowerCase() === dashboardClientId
  ) {
    throw new EntraStaffAuthorizationConfigurationError(
      "Invalid backend API audience for staff activation"
    );
  }

  const scopes = permissions(
    environment,
    "HOPE_ENTRA_REQUIRED_SCOPES"
  );
  const roles = permissions(
    environment,
    "HOPE_ENTRA_REQUIRED_ROLES"
  );

  if (scopes.length === 0 && roles.length === 0) {
    throw new EntraStaffAuthorizationConfigurationError(
      "Staff activation requires a configured API scope or role"
    );
  }

  const allowedClientApplicationIds = required(
    environment,
    "HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS"
  )
    .split(",")
    .map(value => value.trim().toLowerCase());

  if (
    allowedClientApplicationIds.some(
      value => !GUID_PATTERN.test(value)
    ) ||
    new Set(allowedClientApplicationIds).size !==
      allowedClientApplicationIds.length
  ) {
    throw new EntraStaffAuthorizationConfigurationError(
      "Invalid allowed Entra client application IDs"
    );
  }

  return {
    enforcementEnabled: true,
    verificationConfiguration: {
      tenantId,
      audience,
      requiredPermissions: { scopes, roles },
      allowedClientApplicationIds
    }
  };
}
