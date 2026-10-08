import assert from "node:assert/strict";
import {
  EntraStaffAuthorizationConfigurationError,
  getEntraStaffAuthorizationConfiguration,
  type EntraStaffAuthorizationEnvironment
} from "../../src/config/entraStaffAuthorization";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DASHBOARD_CLIENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const API_CLIENT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const validEnabledEnvironment: EntraStaffAuthorizationEnvironment = {
  FEATURE_ENTRA_ADMIN_AUTHORIZATION: "true",
  HOPE_ENTRA_TENANT_ID: TENANT_ID,
  HOPE_ENTRA_API_AUDIENCE: "api://hope-backend-test",
  AUTH_MICROSOFT_ENTRA_ID_ID: DASHBOARD_CLIENT_ID,
  HOPE_ENTRA_REQUIRED_SCOPES: "staff.access",
  HOPE_ENTRA_REQUIRED_ROLES: "staff.reader",
  HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: API_CLIENT_ID,
  HOPE_ADMIN_STAFF_IDS: "canonical-admin-1,canonical-admin-2"
};

function expectConfigurationError(
  environment: EntraStaffAuthorizationEnvironment
): void {
  assert.throws(
    () => getEntraStaffAuthorizationConfiguration(environment),
    EntraStaffAuthorizationConfigurationError
  );
}

function run(): void {
  assert.deepEqual(
    getEntraStaffAuthorizationConfiguration({}),
    { enforcementEnabled: false }
  );
  assert.deepEqual(
    getEntraStaffAuthorizationConfiguration({
      FEATURE_ENTRA_ADMIN_AUTHORIZATION: "false"
    }),
    { enforcementEnabled: false }
  );
  assert.deepEqual(
    getEntraStaffAuthorizationConfiguration({
      FEATURE_ENTRA_ADMIN_AUTHORIZATION: "  "
    }),
    { enforcementEnabled: false }
  );
  assert.deepEqual(
    getEntraStaffAuthorizationConfiguration({
      FEATURE_ENTRA_ADMIN_AUTHORIZATION: "FALSE"
    }),
    { enforcementEnabled: false }
  );
  expectConfigurationError({
    FEATURE_ENTRA_ADMIN_AUTHORIZATION: "enabled"
  });

  assert.deepEqual(
    getEntraStaffAuthorizationConfiguration({
      ...validEnabledEnvironment,
      FEATURE_ENTRA_ADMIN_AUTHORIZATION: " TrUe "
    }),
    {
      enforcementEnabled: true,
      verificationConfiguration: {
        tenantId: TENANT_ID,
        audience: "api://hope-backend-test",
        requiredPermissions: {
          scopes: ["staff.access"],
          roles: ["staff.reader"]
        },
        allowedClientApplicationIds: [API_CLIENT_ID]
      },
      administratorStaffIds: [
        "canonical-admin-1",
        "canonical-admin-2"
      ]
    }
  );

  const disabledWithoutEntraSettings =
    getEntraStaffAuthorizationConfiguration({
      FEATURE_ENTRA_ADMIN_AUTHORIZATION: "false",
      HOPE_ADMIN_API_KEY: "must-not-be-returned",
      HOPE_ADMIN_STAFF_IDS: "not-read-when-disabled"
    });
  assert.deepEqual(disabledWithoutEntraSettings, {
    enforcementEnabled: false
  });
  assert.equal(
    JSON.stringify(disabledWithoutEntraSettings).includes(
      "must-not-be-returned"
    ),
    false
  );

  const validScopeOnly = getEntraStaffAuthorizationConfiguration({
    ...validEnabledEnvironment,
    HOPE_ENTRA_REQUIRED_ROLES: ""
  });
  assert.equal(
    validScopeOnly.enforcementEnabled &&
      validScopeOnly.verificationConfiguration?.requiredPermissions.roles
        ?.length,
    0
  );

  const validRoleOnly = getEntraStaffAuthorizationConfiguration({
    ...validEnabledEnvironment,
    HOPE_ENTRA_REQUIRED_SCOPES: ""
  });
  assert.equal(
    validRoleOnly.enforcementEnabled &&
      validRoleOnly.verificationConfiguration?.requiredPermissions.scopes
        ?.length,
    0
  );

  const normalizedGuids = getEntraStaffAuthorizationConfiguration({
    ...validEnabledEnvironment,
    HOPE_ENTRA_TENANT_ID: TENANT_ID.toUpperCase(),
    AUTH_MICROSOFT_ENTRA_ID_ID: DASHBOARD_CLIENT_ID.toUpperCase(),
    HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: `${API_CLIENT_ID.toUpperCase()},${DASHBOARD_CLIENT_ID}`
  });
  assert.equal(
    normalizedGuids.enforcementEnabled &&
      normalizedGuids.verificationConfiguration?.tenantId,
    TENANT_ID
  );
  assert.deepEqual(
    normalizedGuids.enforcementEnabled &&
      normalizedGuids.verificationConfiguration
        ?.allowedClientApplicationIds,
    [API_CLIENT_ID, DASHBOARD_CLIENT_ID]
  );

  const invalidRequiredValues: Array<
    Partial<EntraStaffAuthorizationEnvironment>
  > = [
    { HOPE_ENTRA_TENANT_ID: undefined },
    { HOPE_ENTRA_TENANT_ID: "not-a-guid" },
    { HOPE_ENTRA_API_AUDIENCE: undefined },
    { HOPE_ENTRA_API_AUDIENCE: "   " },
    { HOPE_ENTRA_API_AUDIENCE: "api://invalid audience" },
    { AUTH_MICROSOFT_ENTRA_ID_ID: undefined },
    { AUTH_MICROSOFT_ENTRA_ID_ID: "not-a-guid" },
    { HOPE_ENTRA_API_AUDIENCE: DASHBOARD_CLIENT_ID },
    { HOPE_ENTRA_REQUIRED_SCOPES: "" , HOPE_ENTRA_REQUIRED_ROLES: "" },
    { HOPE_ENTRA_REQUIRED_SCOPES: "staff.access,,other" },
    { HOPE_ENTRA_REQUIRED_SCOPES: "staff.access, staff.access" },
    { HOPE_ENTRA_REQUIRED_SCOPES: "staff access" },
    { HOPE_ENTRA_REQUIRED_ROLES: "staff.reader," },
    { HOPE_ENTRA_REQUIRED_ROLES: "staff.reader,staff.reader" },
    { HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: undefined },
    { HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: "" },
    { HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: "not-a-guid" },
    {
      HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS:
        `${API_CLIENT_ID},${API_CLIENT_ID.toUpperCase()}`
    },
    { HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: `${API_CLIENT_ID},` },
    { HOPE_ADMIN_STAFF_IDS: undefined },
    { HOPE_ADMIN_STAFF_IDS: "" },
    { HOPE_ADMIN_STAFF_IDS: "admin-1," },
    { HOPE_ADMIN_STAFF_IDS: "admin-1,admin-1" }
  ];

  for (const overrides of invalidRequiredValues) {
    expectConfigurationError({
      ...validEnabledEnvironment,
      ...overrides
    });
  }

  const opaqueAdministratorIds = getEntraStaffAuthorizationConfiguration({
    ...validEnabledEnvironment,
    HOPE_ADMIN_STAFF_IDS: "staff:canonical/001,member-002"
  });
  assert.deepEqual(
    opaqueAdministratorIds.enforcementEnabled &&
      opaqueAdministratorIds.administratorStaffIds,
    ["staff:canonical/001", "member-002"]
  );

  const sensitiveValue = "local-api-key-secret";
  const enabledWithoutApiKey = getEntraStaffAuthorizationConfiguration({
    ...validEnabledEnvironment,
    HOPE_ADMIN_API_KEY: sensitiveValue
  });
  const serializedConfiguration = JSON.stringify(enabledWithoutApiKey);
  assert.equal(serializedConfiguration.includes(sensitiveValue), false);
  assert.equal(serializedConfiguration.includes("HOPE_ADMIN_API_KEY"), false);

  const enabledFailureDoesNotFallBack = {
    ...validEnabledEnvironment,
    HOPE_ENTRA_TENANT_ID: "invalid"
  };
  assert.throws(
    () =>
      getEntraStaffAuthorizationConfiguration(enabledFailureDoesNotFallBack),
    EntraStaffAuthorizationConfigurationError
  );

  console.log("Entra staff authorization configuration tests passed");
}

run();
