import assert from "node:assert/strict";
import {
  createPhaseCRecoveryReservationRepository
} from "../../src/repositories/createPhaseCRecoveryReservationRepository";

function main(): void {
  assert.equal(
    createPhaseCRecoveryReservationRepository({}),
    null
  );

  assert.equal(
    createPhaseCRecoveryReservationRepository({
      enabled: "false"
    }),
    null
  );

  assert.equal(
    createPhaseCRecoveryReservationRepository({
      enabled: "TRUE"
    }),
    null
  );

  console.log("PASS=DEFAULT_DISABLED");

  assert.throws(
    () => createPhaseCRecoveryReservationRepository({
      enabled: "true",
      tableName: "invalid-name"
    }),
    /PHASE_C_RECOVERY_TABLE_INVALID/
  );

  console.log("PASS=INVALID_TABLE_DENIED");

  assert.throws(
    () => createPhaseCRecoveryReservationRepository({
      enabled: "true",
      tableName: "PhaseCRecoveryLedger",
      endpoint: "http://127.0.0.1:11002",
      managedIdentityClientId:
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }),
    /Azure HTTPS table endpoint/
  );

  console.log("PASS=INSECURE_ENDPOINT_DENIED");

  assert.throws(
    () => createPhaseCRecoveryReservationRepository({
      enabled: "true",
      tableName: "PhaseCRecoveryLedger",
      endpoint: "https://example.table.core.windows.net",
      managedIdentityClientId: "invalid"
    }),
    /managed identity client ID/
  );

  console.log("PASS=INVALID_IDENTITY_DENIED");

  console.log("PHASE_C_PRIVATE_STORAGE_BINDING_TESTS_PASSED=True");
}

main();
