import assert from "node:assert/strict";

import {
  resolvePhaseCRecoveryStorage
} from "../../src/services/authorization/resolvePhaseCRecoveryStorage";

function main(): void {
  const valid = {
    HOPE_PHASE_C_RECOVERY_STORAGE_ENABLED: "true",
    HOPE_PHASE_C_RECOVERY_TABLE_NAME: "PhaseCRecoveryLedger",
    HOPE_TABLE_AUTH_MODE: "managed-identity",
    HOPE_TABLE_ENDPOINT:
      "https://hopec6flexstg01.table.core.windows.net",
    HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID:
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  };

  assert.equal(resolvePhaseCRecoveryStorage({}), null);

  assert.equal(
    resolvePhaseCRecoveryStorage({
      ...valid,
      HOPE_PHASE_C_RECOVERY_STORAGE_ENABLED: "false"
    }),
    null
  );

  assert.equal(
    resolvePhaseCRecoveryStorage({
      ...valid,
      HOPE_PHASE_C_RECOVERY_STORAGE_ENABLED: "TRUE"
    }),
    null
  );

  console.log("PASS=DEFAULT_DISABLED");

  assert.throws(
    () => resolvePhaseCRecoveryStorage({
      ...valid,
      HOPE_TABLE_AUTH_MODE: "connection-string"
    }),
    /PHASE_C_MANAGED_IDENTITY_REQUIRED/
  );

  assert.throws(
    () => resolvePhaseCRecoveryStorage({
      ...valid,
      HOPE_TABLE_AUTH_MODE: undefined
    }),
    /PHASE_C_MANAGED_IDENTITY_REQUIRED/
  );

  console.log("PASS=NO_CONNECTION_STRING_FALLBACK");

  assert.throws(
    () => resolvePhaseCRecoveryStorage({
      ...valid,
      HOPE_PHASE_C_RECOVERY_TABLE_NAME: ""
    }),
    /PHASE_C_RECOVERY_TABLE_INVALID/
  );

  assert.throws(
    () => resolvePhaseCRecoveryStorage({
      ...valid,
      HOPE_TABLE_ENDPOINT: "http://127.0.0.1:11002"
    }),
    /Azure HTTPS table endpoint/
  );

  console.log("PASS=INVALID_CONFIGURATION_DENIED");

  const repository = resolvePhaseCRecoveryStorage(valid);

  assert.ok(repository);
  assert.equal(typeof repository.reserve, "function");

  console.log("PASS=OPT_IN_CONSTRUCTION_ONLY");
  console.log("PHASE_C_INTERNAL_STORAGE_CONFIGURATION_TESTS_PASSED=True");
}

main();
