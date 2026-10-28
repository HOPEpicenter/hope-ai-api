import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FormationEventInspectionAuthorizationConfigurationError,
  getFormationEventInspectionAuthorizationConfiguration
} from "../../src/config/formationEventInspectionAuthorization";
import { EntraStaffAuthorizationConfigurationError } from "../../src/config/entraStaffAuthorization";
import type { TrustedAdminAuthorizationConfiguration } from "../../src/services/formation/inspectFormationEventWithAuthenticatedAdmin";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DASHBOARD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AUDIENCE = "api://hope-backend-synthetic";
const FLAG = "FEATURE_FORMATION_EVENT_EVIDENCE_INSPECTION";

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    [FLAG]: "true",
    FEATURE_ENTRA_ADMIN_AUTHORIZATION: "true",
    HOPE_ENTRA_TENANT_ID: TENANT,
    HOPE_ENTRA_API_AUDIENCE: AUDIENCE,
    AUTH_MICROSOFT_ENTRA_ID_ID: DASHBOARD,
    HOPE_ENTRA_REQUIRED_SCOPES: "staff.access",
    HOPE_ENTRA_REQUIRED_ROLES: "",
    HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: CLIENT,
    HOPE_ADMIN_STAFF_IDS: "synthetic-admin-1,synthetic-admin-2",
    ...overrides
  };
}

function rejects(environment: Record<string, string | undefined>, type: Function = Error): void {
  assert.throws(() => getFormationEventInspectionAuthorizationConfiguration(environment), type);
}

let passed = 0;
function test(name: string, run: () => void): void {
  run();
  passed++;
  console.log(`PASS ${name}`);
}

test("missing, empty, and false settings return disabled configuration", () => {
  for (const value of [undefined, "", "   ", "false", "FALSE", "False", " false "]) {
    const result = getFormationEventInspectionAuthorizationConfiguration({ [FLAG]: value });
    assert.deepEqual(result, { evidenceInspectionEnabled: false });
    assert.equal("authorizationConfiguration" in result, false);
  }
  assert.deepEqual(getFormationEventInspectionAuthorizationConfiguration({}), { evidenceInspectionEnabled: false });
});

test("disabled mode ignores unrelated and malformed Entra settings", () => {
  const result = getFormationEventInspectionAuthorizationConfiguration({
    [FLAG]: "false",
    FEATURE_ENTRA_ADMIN_AUTHORIZATION: "garbage",
    HOPE_ENTRA_TENANT_ID: "bad",
    HOPE_ADMIN_STAFF_IDS: ""
  });
  assert.deepEqual(result, { evidenceInspectionEnabled: false });
});

test("invalid inspection values are rejected with the named error", () => {
  for (const value of ["yes", "1", "enabled", "on", "truee", "t", "0", "no", "true,false", "null"]) {
    rejects(env({ [FLAG]: value }), FormationEventInspectionAuthorizationConfigurationError);
  }
  const error = (() => {
    try { getFormationEventInspectionAuthorizationConfiguration(env({ [FLAG]: "yes" })); } catch (e) { return e as Error; }
  })();
  assert.equal(error?.name, "FormationEventInspectionAuthorizationConfigurationError");
  assert.equal(error instanceof Error, true);
});

test("non-string flag value and invalid environment dictionaries are rejected", () => {
  rejects({ [FLAG]: true as unknown as string }, FormationEventInspectionAuthorizationConfigurationError);
  rejects({ [FLAG]: 1 as unknown as string }, FormationEventInspectionAuthorizationConfigurationError);
  for (const bad of [null, "true", 5]) {
    assert.throws(
      () => getFormationEventInspectionAuthorizationConfiguration(bad as never),
      FormationEventInspectionAuthorizationConfigurationError
    );
  }
});

test("explicit true in any case with whitespace yields enabled configuration", () => {
  for (const value of ["true", "TRUE", "True", "  true  ", "\ttRuE\n"]) {
    const result = getFormationEventInspectionAuthorizationConfiguration(env({ [FLAG]: value }));
    assert.equal(result.evidenceInspectionEnabled, true);
  }
});

test("enabled inspection with absent, false, or malformed Entra enforcement is rejected", () => {
  rejects(env({ FEATURE_ENTRA_ADMIN_AUTHORIZATION: undefined }), FormationEventInspectionAuthorizationConfigurationError);
  rejects(env({ FEATURE_ENTRA_ADMIN_AUTHORIZATION: "" }), FormationEventInspectionAuthorizationConfigurationError);
  rejects(env({ FEATURE_ENTRA_ADMIN_AUTHORIZATION: "false" }), FormationEventInspectionAuthorizationConfigurationError);
  rejects(env({ FEATURE_ENTRA_ADMIN_AUTHORIZATION: "FALSE" }), FormationEventInspectionAuthorizationConfigurationError);
  for (const value of ["yes", "1", "enabled"]) {
    rejects(env({ FEATURE_ENTRA_ADMIN_AUTHORIZATION: value }), EntraStaffAuthorizationConfigurationError);
  }
});

test("enabled inspection with missing or malformed Entra settings is rejected", () => {
  const cases: Record<string, string | undefined>[] = [
    { HOPE_ENTRA_TENANT_ID: undefined },
    { HOPE_ENTRA_TENANT_ID: "not-a-guid" },
    { HOPE_ENTRA_API_AUDIENCE: undefined },
    { HOPE_ENTRA_API_AUDIENCE: "bad audience" },
    { AUTH_MICROSOFT_ENTRA_ID_ID: undefined },
    { AUTH_MICROSOFT_ENTRA_ID_ID: "not-a-guid" },
    { AUTH_MICROSOFT_ENTRA_ID_ID: AUDIENCE },
    { HOPE_ENTRA_API_AUDIENCE: DASHBOARD },
    { HOPE_ENTRA_REQUIRED_SCOPES: "", HOPE_ENTRA_REQUIRED_ROLES: "" },
    { HOPE_ENTRA_REQUIRED_SCOPES: "bad scope" },
    { HOPE_ENTRA_REQUIRED_SCOPES: "a,a" },
    { HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: undefined },
    { HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: "not-a-guid" },
    { HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS: `${CLIENT},${CLIENT}` },
    { HOPE_ADMIN_STAFF_IDS: undefined },
    { HOPE_ADMIN_STAFF_IDS: "" },
    { HOPE_ADMIN_STAFF_IDS: "a,,b" },
    { HOPE_ADMIN_STAFF_IDS: "a,a" }
  ];
  for (const overrides of cases) {
    rejects(env(overrides), EntraStaffAuthorizationConfigurationError);
  }
});

test("valid fully enabled synthetic configuration matches the trusted-admin shape", () => {
  const result = getFormationEventInspectionAuthorizationConfiguration(env());
  assert.equal(result.evidenceInspectionEnabled, true);
  if (!result.evidenceInspectionEnabled) throw new Error("expected enabled");
  const config: TrustedAdminAuthorizationConfiguration = result.authorizationConfiguration;
  assert.deepEqual(Object.keys(config).sort(), ["administratorStaffIds", "enforcementEnabled", "verificationConfiguration"]);
  assert.equal(config.enforcementEnabled, true);
  assert.deepEqual(config.administratorStaffIds, ["synthetic-admin-1", "synthetic-admin-2"]);
  assert.equal(config.verificationConfiguration.tenantId, TENANT);
  assert.equal(config.verificationConfiguration.audience, AUDIENCE);
  assert.deepEqual(config.verificationConfiguration.requiredPermissions.scopes, ["staff.access"]);
  assert.deepEqual(config.verificationConfiguration.requiredPermissions.roles, []);
  assert.deepEqual(config.verificationConfiguration.allowedClientApplicationIds, [CLIENT]);
  assert.deepEqual(Object.keys(result).sort(), ["authorizationConfiguration", "evidenceInspectionEnabled"]);
});

test("output is frozen and detached from the input environment", () => {
  const environment = env();
  const result = getFormationEventInspectionAuthorizationConfiguration(environment);
  assert.equal(Object.isFrozen(result), true);
  if (!result.evidenceInspectionEnabled) throw new Error("expected enabled");
  assert.equal(Object.isFrozen(result.authorizationConfiguration), true);
  assert.equal(Object.isFrozen(result.authorizationConfiguration.administratorStaffIds), true);
  environment.HOPE_ADMIN_STAFF_IDS = "changed";
  assert.deepEqual(result.authorizationConfiguration.administratorStaffIds, ["synthetic-admin-1", "synthetic-admin-2"]);
});

test("no default-on behavior and no legacy fallback", () => {
  assert.equal(getFormationEventInspectionAuthorizationConfiguration({}).evidenceInspectionEnabled, false);
  // Legacy-style settings never enable inspection or substitute for Entra settings.
  const legacy = { ADMIN_API_KEY: "synthetic-legacy-key", FEATURE_ENTRA_ADMIN_AUTHORIZATION: "true" };
  assert.deepEqual(
    getFormationEventInspectionAuthorizationConfiguration(legacy),
    { evidenceInspectionEnabled: false }
  );
  rejects({ ...legacy, [FLAG]: "true" });
  // Entra enforcement alone does not enable inspection.
  const enabledEntraOnly = env({ [FLAG]: undefined });
  assert.deepEqual(getFormationEventInspectionAuthorizationConfiguration(enabledEntraOnly), { evidenceInspectionEnabled: false });
});

test("default environment is process.env and is disabled when unset", () => {
  const original = process.env[FLAG];
  delete process.env[FLAG];
  try {
    assert.deepEqual(getFormationEventInspectionAuthorizationConfiguration(), { evidenceInspectionEnabled: false });
    process.env[FLAG] = "maybe";
    assert.throws(() => getFormationEventInspectionAuthorizationConfiguration(), FormationEventInspectionAuthorizationConfigurationError);
  } finally {
    if (original === undefined) delete process.env[FLAG];
    else process.env[FLAG] = original;
  }
});

test("enabled output contains no secrets, tokens, or request-derived values", () => {
  const result = getFormationEventInspectionAuthorizationConfiguration(
    env({ ADMIN_API_KEY: "synthetic-secret-key", STORAGE_CONNECTION_STRING: "synthetic-connection-secret" })
  );
  const serialized = JSON.stringify(result);
  for (const forbidden of ["synthetic-secret-key", "synthetic-connection-secret", DASHBOARD, "token", "decision", "apiKey"]) {
    assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test("source has no runtime, storage, network, endpoint, or legacy dependencies", () => {
  const source = fs.readFileSync("src/config/formationEventInspectionAuthorization.ts", "utf8");
  for (const forbidden of [
    "fetch(", "app.http", "@azure/", "tableClient", "readFormationEventAcquisition",
    "authorizeAuthenticatedStaffAction", "adminStaffActor", "authenticatedAdminStaffActor",
    "adminApiKey", "ADMIN_API_KEY", "featureFlags", "request", "headers", "catch"
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.equal((source.match(/process\.env/g) ?? []).length, 1);
});

console.log(`Passed ${passed} formation-event inspection configuration tests.`);
