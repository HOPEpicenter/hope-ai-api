import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import {
  PhaseCRecoveryReservationRepository
} from "../../src/repositories/phaseCRecoveryReservationRepository";

// Emulator-only test: never accept a remote connection string.
if (process.env.HOPE_PHASE_C_AZURITE_PORT !== "11002") {
  throw new Error("Approved local Azurite port required");
}

const connectionString = [
  "DefaultEndpointsProtocol=http",
  "AccountName=devstoreaccount1",
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
].join(";");

async function main(): Promise<void> {
  const tableName =
    "PhaseCReserveIT" + randomBytes(10).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    tableName,
    { allowInsecureConnection: true }
  );

  await table.createTable();

  try {
    const repo = new PhaseCRecoveryReservationRepository(table);
    const operationId = randomUUID();
    const requestId = randomUUID();

    const request = {
      operationId,
      requestId,
      createdUtc: 100
    };

    const decisions = await Promise.all(
      Array.from({ length: 12 }, () => repo.reserve(request))
    );

    assert.equal(
      decisions.filter(x => x.status === "reserved").length,
      1,
      "Exactly one concurrent reservation must succeed"
    );

    assert.ok(decisions.every(x =>
      x.executionAuthorized === false &&
      x.retryAuthorized === false
    ));

    console.log("PASS=AZURITE_CONCURRENT_SINGLE_WINNER");

    assert.equal(
      (await repo.reserve({
        ...request,
        requestId: randomUUID()
      })).status,
      "conflict"
    );

    assert.equal(
      (await repo.reserve({
        ...request,
        operationId: randomUUID()
      })).status,
      "conflict"
    );

    console.log("PASS=AZURITE_GLOBAL_ID_UNIQUENESS");

    const operation = await table.getEntity<{
      requestId: string;
      state: string;
    }>(
      "phase-c-recovery-v1",
      `operation-${operationId}`
    );

    const requestRow = await table.getEntity<{
      operationId: string;
      state: string;
    }>(
      "phase-c-recovery-v1",
      `request-${requestId}`
    );

    assert.equal(operation.requestId, requestId);
    assert.equal(requestRow.operationId, operationId);
    assert.equal(operation.state, "UNRESOLVED");
    assert.equal(requestRow.state, "UNRESOLVED");

    console.log("PASS=AZURITE_DURABLE_TWO_ROW_RESERVATION");
    console.log("PHASE_C_AZURITE_TRANSACTION_TEST_PASSED=True");
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
