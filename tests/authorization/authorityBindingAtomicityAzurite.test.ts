import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TableClient, type TransactionAction } from "@azure/data-tables";

/**
 * E154: LOCAL AZURITE FEASIBILITY PROOF ONLY.
 * Synthetic binding ownership in ONE Azure Table partition.
 *
 * This proves only emulator transactional behavior: one successful claim,
 * receipt co-commit, ETag-fenced revocation, stale rejection and durable
 * inspection after a simulated lost acknowledgement.
 * It does NOT establish global binding ownership across partitions/tables,
 * identity isolation, Azure RBAC denial or permission for live Staff action.
 */
if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true" ||
    process.env.HOPE_OAUTH_AZURITE_TABLE_PORT !== "11002") {
  throw new Error("E154 requires the dedicated loopback Azurite Table emulator");
}
const connectionString = [
  "DefaultEndpointsProtocol=http",
  "AccountName=devstoreaccount1",
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
].join(";");

const partitionKey = "synthetic-global-binding-namespace";
const bindingKey = "binding-0123456789abcdef";
const candidateIds = ["synthetic-owner-one", "synthetic-owner-two"];
const receiptPrefix = "receipt-";

async function main(): Promise<void> {
  const tableName = "AuthorityE154IT" + randomBytes(8).toString("hex");
  const table = TableClient.fromConnectionString(connectionString, tableName, {
    allowInsecureConnection: true
  });
  await table.createTable();
  try {
    function claimActions(owner: string, receipt: string): TransactionAction[] {
      return [
        ["create", {
          partitionKey, rowKey: bindingKey, owner,
          state: "active", revision: 1
        }],
        ["create", {
          partitionKey, rowKey: receiptPrefix + receipt,
          operation: "claim", owner, revision: 1
        }]
      ];
    }

    const results = await Promise.all(candidateIds.map(async (owner, index) => {
      try {
        await table.submitTransaction(claimActions(owner, String(index)));
        return true;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        assert.ok(status === 409 || status === 412,
          "Only a transactional binding conflict can deny the competing claim");
        return false;
      }
    }));
    assert.equal(results.filter(Boolean).length, 1,
      "Exactly one synthetic candidate may own the binding");

    const winner = await table.getEntity<{
      owner: string; state: string; revision: number;
    }>(partitionKey, bindingKey);
    assert.ok(candidateIds.includes(winner.owner));
    assert.equal(winner.state, "active");
    assert.equal(winner.revision, 1);

    async function receiptCount(): Promise<number> {
      let count = 0;
      for await (const entity of table.listEntities({
        queryOptions: { filter: `PartitionKey eq '${partitionKey}'` }
      })) {
        if (typeof entity.rowKey === "string" &&
            entity.rowKey.startsWith(receiptPrefix)) count++;
      }
      return count;
    }
    assert.equal(await receiptCount(), 1,
      "Losing claim must not leave an orphan receipt");

    // A conditional revocation and its receipt commit in one partition.
    const revokeActions: TransactionAction[] = [
      ["update", {
        partitionKey, rowKey: bindingKey, owner: winner.owner,
        state: "revoked", revision: 2
      }, "Replace", { etag: winner.etag }],
      ["create", {
        partitionKey, rowKey: receiptPrefix + "revoke",
        operation: "revoke", owner: winner.owner, revision: 2
      }]
    ];

    // Simulate loss of acknowledgement AFTER Azurite commits.
    let acknowledgementLost = false;
    try {
      await table.submitTransaction(revokeActions);
      throw new Error("synthetic_acknowledgement_lost");
    } catch (error) {
      assert.equal((error as Error).message, "synthetic_acknowledgement_lost");
      acknowledgementLost = true;
    }
    assert.equal(acknowledgementLost, true);

    const revoked = await table.getEntity<{
      owner: string; state: string; revision: number;
    }>(partitionKey, bindingKey);
    assert.equal(revoked.state, "revoked");
    assert.equal(revoked.revision, 2);
    assert.equal(await receiptCount(), 2);
    const durableReceipt = await table.getEntity(
      partitionKey, receiptPrefix + "revoke"
    );
    assert.equal(durableReceipt.operation, "revoke");

    // A stale claim/revocation cannot change the already-revoked owner.
    let staleRejected = false;
    try {
      await table.submitTransaction(revokeActions);
    } catch (error) {
      staleRejected = [409, 412].includes(
        (error as { statusCode?: number }).statusCode ?? -1
      );
    }
    assert.equal(staleRejected, true);
    assert.equal((await table.getEntity<{revision: number}>(
      partitionKey, bindingKey
    )).revision, 2);
    assert.equal(await receiptCount(), 2);

    // All production actions remain explicitly forbidden.
    const executionPermitted = false;
    const authorityWritePermitted = false;
    const retryPermitted = false;
    assert.equal(executionPermitted, false);
    assert.equal(authorityWritePermitted, false);
    assert.equal(retryPermitted, false);
    console.log("E154 synthetic authority binding Azurite atomicity proof passed");
  } finally {
    await table.deleteTable();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
