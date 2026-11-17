import assert from "node:assert/strict";
import {
  reserveKioskBootstrapGate
} from "../../src/repositories/kioskBootstrapGate";

const operationId = "33333333-3333-4333-8333-333333333333";

async function main(): Promise<void> {
  let writes = 0;

  const port = {
    createEntity: async (_entity: {
      partitionKey: string;
      rowKey: string;
      operationId: string;
    }) => {
      writes++;
    }
  };

  const disabled = await reserveKioskBootstrapGate(
    port, operationId
  );
  assert.equal(disabled.status, "disabled");
  assert.equal(writes, 0);

  const invalid = await reserveKioskBootstrapGate(
    port, "invalid", true
  );
  assert.equal(invalid.status, "invalid");
  assert.equal(writes, 0);

  const first = await reserveKioskBootstrapGate(
    port, operationId, true
  );
  assert.equal(first.status, "reserved");
  assert.equal(writes, 1);

  const conflict = await reserveKioskBootstrapGate({
    createEntity: async () => {
      throw { statusCode: 409 };
    }
  }, operationId, true);

  assert.equal(conflict.status, "conflict");

  const uncertain = await reserveKioskBootstrapGate({
    createEntity: async () => {
      throw new Error("lost acknowledgement");
    }
  }, operationId, true);

  assert.equal(uncertain.status, "uncertain");

  for (const outcome of [
    disabled, invalid, first, conflict, uncertain
  ]) {
    assert.equal(outcome.authorizationGranted, false);
    assert.equal(outcome.staffCreationPermitted, false);
    assert.equal(outcome.retryPermitted, false);
  }

  console.log("DEFAULT_DISABLED_ZERO_WRITES=True");
  console.log("INVALID_OPERATION_DENIED=True");
  console.log("SINGLETON_CREATE_CONTRACT_PASSED=True");
  console.log("CONFLICT_REJECTED=True");
  console.log("UNCERTAIN_OUTCOME_NO_RETRY=True");
  console.log("STAFF_CREATION_ALWAYS_DISABLED=True");
  console.log("K314_OFFLINE_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
