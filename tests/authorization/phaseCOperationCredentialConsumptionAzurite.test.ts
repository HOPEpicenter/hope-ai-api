import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  PhaseCOperationCredentialConsumptionRepository
} from "../../src/repositories/phaseCOperationCredentialConsumptionRepository";

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
    "PhaseCConsumeIT" + randomBytes(10).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    tableName,
    { allowInsecureConnection: true }
  );

  await table.createTable();

  try {
    const repository =
      new PhaseCOperationCredentialConsumptionRepository(table);

    const claim = {
      credentialId: randomUUID(),
      operationId: randomUUID(),
      requestId: randomUUID(),
      expiresUtc: Math.floor(Date.now() / 1000) + 120
    };

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () => repository.claim(claim))
    );

    assert.equal(
      outcomes.filter(x => x.status === "claimed").length,
      1,
      "Exactly one concurrent claim must succeed"
    );

    assert.ok(outcomes.every(x =>
      x.executionAuthorized === false &&
      x.retryAuthorized === false
    ));

    console.log("PASS=AZURITE_CONCURRENT_SINGLE_WINNER");

    assert.equal(
      (await repository.claim(claim)).status,
      "conflict"
    );

    assert.equal(
      (await repository.claim({
        ...claim,
        credentialId: randomUUID()
      })).status,
      "conflict"
    );

    assert.equal(
      (await repository.claim({
        ...claim,
        operationId: randomUUID(),
        requestId: randomUUID()
      })).status,
      "conflict"
    );

    console.log("PASS=AZURITE_DURABLE_REPLAY_DENIAL");

    for (const [prefix, id] of [
      ["credential", claim.credentialId],
      ["operation", claim.operationId],
      ["request", claim.requestId]
    ]) {
      const entity = await table.getEntity<{
        state: string;
        credentialId: string;
        operationId: string;
        requestId: string;
      }>(
        "phase-c-credential-use-v1",
        `${prefix}-${id}`
      );

      assert.equal(entity.state, "CLAIMED_UNAUTHORIZED");
      assert.equal(entity.credentialId, claim.credentialId);
      assert.equal(entity.operationId, claim.operationId);
      assert.equal(entity.requestId, claim.requestId);
    }

    console.log("PASS=AZURITE_ATOMIC_THREE_ROW_PERSISTENCE");
    console.log("PHASE_C_CREDENTIAL_AZURITE_TEST_PASSED=True");
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
