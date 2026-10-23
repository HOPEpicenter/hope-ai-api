import assert from "node:assert/strict";
import {
  getEntraStaffActivationAuthorizationConfiguration
} from "../../src/config/entraStaffActivationAuthorization";

const tenantId = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const clientId = "c1717a19-c719-4ed2-8b72-e013800095de";
const otherClientId = "33a40230-0bea-4cf9-a7e0-d33d95d38c99";

const enabled = {
  FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION: "true",
  HOPE_ENTRA_TENANT_ID: tenantId,
  HOPE_ENTRA_API_AUDIENCE: "api://synthetic-hope-backend",
  AUTH_MICROSOFT_ENTRA_ID_ID: clientId,
  HOPE_ENTRA_REQUIRED_SCOPES: "HOPE.Staff.Activate",
  HOPE_ENTRA_REQUIRED_ROLES: "",
  HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: clientId
};

function fails(
  name: string,
  environment: Record<string, string | undefined>
): void {
  assert.throws(
    () => getEntraStaffActivationAuthorizationConfiguration(environment),
    Error,
    name
  );
}

function run(): void {
  // Default-off mode requires no Entra configuration.
  assert.deepEqual(
    getEntraStaffActivationAuthorizationConfiguration({}),
    { enforcementEnabled: false }
  );

  assert.deepEqual(
    getEntraStaffActivationAuthorizationConfiguration({
      FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION: "false"
    }),
    { enforcementEnabled: false }
  );

  // Enabled configuration must be constructed from trusted settings.
  const configuration =
    getEntraStaffActivationAuthorizationConfiguration(enabled);

  assert.equal(configuration.enforcementEnabled, true);

  if (!configuration.enforcementEnabled) {
    throw new Error("Expected enabled configuration");
  }

  assert.deepEqual(configuration.verificationConfiguration, {
    tenantId,
    audience: "api://synthetic-hope-backend",
    requiredPermissions: {
      scopes: ["HOPE.Staff.Activate"],
      roles: []
    },
    allowedClientApplicationIds: [clientId]
  });

  // Administrator membership must not be required for activation.
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      configuration,
      "administratorStaffIds"
    ),
    false
  );

  fails("malformed feature flag", {
    ...enabled,
    FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION: "enabled"
  });

  fails("missing tenant", {
    ...enabled,
    HOPE_ENTRA_TENANT_ID: ""
  });

  fails("malformed tenant", {
    ...enabled,
    HOPE_ENTRA_TENANT_ID: "not-a-guid"
  });

  fails("missing audience", {
    ...enabled,
    HOPE_ENTRA_API_AUDIENCE: ""
  });

  fails("dashboard audience collision", {
    ...enabled,
    HOPE_ENTRA_API_AUDIENCE: clientId
  });

  fails("audience whitespace", {
    ...enabled,
    HOPE_ENTRA_API_AUDIENCE: "api://invalid audience"
  });

  fails("missing dashboard client ID", {
    ...enabled,
    AUTH_MICROSOFT_ENTRA_ID_ID: ""
  });

  fails("missing permissions", {
    ...enabled,
    HOPE_ENTRA_REQUIRED_SCOPES: "",
    HOPE_ENTRA_REQUIRED_ROLES: ""
  });

  fails("malformed permissions", {
    ...enabled,
    HOPE_ENTRA_REQUIRED_SCOPES: "HOPE.Staff.Activate,?"
  });

  fails("duplicate permissions", {
    ...enabled,
    HOPE_ENTRA_REQUIRED_SCOPES:
      "HOPE.Staff.Activate,HOPE.Staff.Activate"
  });

  fails("missing client allowlist", {
    ...enabled,
    HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: ""
  });

  fails("malformed client allowlist", {
    ...enabled,
    HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: "not-a-guid"
  });

  fails("duplicate client allowlist", {
    ...enabled,
    HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: `${clientId},${clientId}`
  });

  const multipleClients =
    getEntraStaffActivationAuthorizationConfiguration({
      ...enabled,
      HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS:
        `${clientId},${otherClientId}`
    });

  assert.equal(multipleClients.enforcementEnabled, true);

  if (multipleClients.enforcementEnabled) {
    assert.deepEqual(
      multipleClients.verificationConfiguration.allowedClientApplicationIds,
      [clientId, otherClientId]
    );
  }

  console.log(
    "Staff activation Entra configuration regression tests passed"
  );
}

run();
