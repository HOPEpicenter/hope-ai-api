import type { AuthenticatedAdminStaffActorConfiguration } from "../functions/_shared/authenticatedAdminStaffActor";

export type EntraStaffAuthorizationEnvironment = Readonly<
  Record<string, string | undefined>
>;

export class EntraStaffAuthorizationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntraStaffAuthorizationConfigurationError";
  }
}

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERMISSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

function requiredValue(
  environment: EntraStaffAuthorizationEnvironment,
  name: string
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new EntraStaffAuthorizationConfigurationError(
      `Required Entra authorization setting is missing: ${name}`
    );
  }
  return value;
}

function requiredGuid(
  environment: EntraStaffAuthorizationEnvironment,
  name: string
): string {
  const value = requiredValue(environment, name);
  if (!GUID_PATTERN.test(value)) {
    throw new EntraStaffAuthorizationConfigurationError(
      `Entra authorization setting must be a GUID: ${name}`
    );
  }
  return value.toLowerCase();
}

function parseCsv(
  environment: EntraStaffAuthorizationEnvironment,
  name: string,
  required: boolean
): string[] {
  const rawValue = environment[name];

  if (rawValue === undefined || rawValue.trim() === "") {
    if (required) {
      throw new EntraStaffAuthorizationConfigurationError(
        `Required Entra authorization setting is missing: ${name}`
      );
    }
    return [];
  }

  const values = rawValue.split(",").map(value => value.trim());
  if (values.some(value => value.length === 0)) {
    throw new EntraStaffAuthorizationConfigurationError(
      `Entra authorization setting contains an empty list entry: ${name}`
    );
  }

  return values;
}

function parsePermissions(
  environment: EntraStaffAuthorizationEnvironment,
  name: "HOPE_ENTRA_REQUIRED_SCOPES" | "HOPE_ENTRA_REQUIRED_ROLES"
): string[] {
  const values = parseCsv(environment, name, false);
  const seen = new Set<string>();

  for (const value of values) {
    if (!PERMISSION_PATTERN.test(value)) {
      throw new EntraStaffAuthorizationConfigurationError(
        `Entra authorization setting contains a malformed permission: ${name}`
      );
    }
    if (seen.has(value)) {
      throw new EntraStaffAuthorizationConfigurationError(
        `Entra authorization setting contains a duplicate permission: ${name}`
      );
    }
    seen.add(value);
  }

  return values;
}

function parseClientApplicationIds(
  environment: EntraStaffAuthorizationEnvironment
): string[] {
  const values = parseCsv(
    environment,
    "HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS",
    true
  );
  const normalizedValues = values.map(value => {
    if (!GUID_PATTERN.test(value)) {
      throw new EntraStaffAuthorizationConfigurationError(
        "Entra allowed client application IDs must be GUIDs"
      );
    }
    return value.toLowerCase();
  });

  if (new Set(normalizedValues).size !== normalizedValues.length) {
    throw new EntraStaffAuthorizationConfigurationError(
      "Entra allowed client application IDs must not contain duplicates"
    );
  }

  return normalizedValues;
}

function parseAdministratorStaffIds(
  environment: EntraStaffAuthorizationEnvironment
): string[] {
  const values = parseCsv(environment, "HOPE_ADMIN_STAFF_IDS", true);
  if (new Set(values).size !== values.length) {
    throw new EntraStaffAuthorizationConfigurationError(
      "Administrator Staff IDs must not contain duplicates"
    );
  }
  return values;
}

/**
 * Reads trusted backend environment settings only. When enforcement is
 * disabled, no inactive Entra or administrator configuration is returned.
 * Enabled mode also requires the dashboard's existing
 * AUTH_MICROSOFT_ENTRA_ID_ID setting so a client-ID audience cannot be
 * mistaken for the backend API audience. Do not populate this environment
 * dictionary from request data.
 */
export function getEntraStaffAuthorizationConfiguration(
  environment: EntraStaffAuthorizationEnvironment = process.env
): AuthenticatedAdminStaffActorConfiguration {
  const featureValue =
    environment.FEATURE_ENTRA_ADMIN_AUTHORIZATION?.trim() ?? "";

  if (featureValue === "" || featureValue.toLowerCase() === "false") {
    return { enforcementEnabled: false };
  }

  if (featureValue.toLowerCase() !== "true") {
    throw new EntraStaffAuthorizationConfigurationError(
      "Feature setting must be true or false: FEATURE_ENTRA_ADMIN_AUTHORIZATION"
    );
  }

  const tenantId = requiredGuid(environment, "HOPE_ENTRA_TENANT_ID");
  const audience = requiredValue(environment, "HOPE_ENTRA_API_AUDIENCE");
  if (/[\s\u0000-\u001f\u007f]/.test(audience)) {
    throw new EntraStaffAuthorizationConfigurationError(
      "Backend API audience contains invalid whitespace or control characters"
    );
  }
  const dashboardClientApplicationId = requiredGuid(
    environment,
    "AUTH_MICROSOFT_ENTRA_ID_ID"
  );

  if (
    audience.toLowerCase() === dashboardClientApplicationId.toLowerCase()
  ) {
    throw new EntraStaffAuthorizationConfigurationError(
      "Backend API audience must differ from the dashboard client application ID"
    );
  }

  const scopes = parsePermissions(
    environment,
    "HOPE_ENTRA_REQUIRED_SCOPES"
  );
  const roles = parsePermissions(
    environment,
    "HOPE_ENTRA_REQUIRED_ROLES"
  );
  if (scopes.length === 0 && roles.length === 0) {
    throw new EntraStaffAuthorizationConfigurationError(
      "At least one Entra API scope or app role must be configured"
    );
  }

  const allowedClientApplicationIds =
    parseClientApplicationIds(environment);
  const administratorStaffIds =
    parseAdministratorStaffIds(environment);

  return {
    enforcementEnabled: true,
    verificationConfiguration: {
      tenantId,
      audience,
      requiredPermissions: { scopes, roles },
      allowedClientApplicationIds
    },
    administratorStaffIds
  };
}
