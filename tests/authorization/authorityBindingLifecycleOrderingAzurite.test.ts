import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import {
  OAuthStaffSecurityStorageRepository,
  STAFF_SECURITY_HEAD_ROW,
  STAFF_SECURITY_PROTOTYPE_PARTITION
} from "../../src/repositories/oauthStaffSecurityStorageRepository";

/**
 * E155 local-only, synthetic ordering regression against the existing
 * NON-AUTHORIZING prototype. No Azure identities, StaffEvents, live
 * resources, external execution, or deployment.
 *
 * The shared partition is a feasibility model, not an approved production
 * authority protocol. In particular, this test does not prove independent
 * legacy-writer exclusion or cross-table atomicity.
 */
if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true" ||
    process.env.HOPE_OAUTH_AZURITE_TABLE_PORT !== "11002") {
  throw new Error("E155 requires dedicated loopback-only Azurite Table");
}

const connectionString = [
  "DefaultEndpointsProtocol=http",
  "AccountName=devstoreaccount1",
  "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
  "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
].join(";");

const tenantId = "11111111-1111-4111-8111-111111111111";
const objectId = "22222222-2222-4222-8222-222222222222";
const partition = STAFF_SECURITY_PROTOTYPE_PARTITION;
const bindingRow = `binding-${tenantId}-${objectId}`;

function deny(result: { executionPermitted: false; retryPermitted: false }): void {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
}
async function main(): Promise<void> {
  const table = TableClient.fromConnectionString(
    connectionString,
    "AuthorityE155IT" + randomBytes(8).toString("hex"),
    { allowInsecureConnection: true }
  );
  await table.createTable();
  try {
    await table.createEntity({
      partitionKey: partition, rowKey: STAFF_SECURITY_HEAD_ROW,
      revision: 0, state: "active"
    });

    const repository = new OAuthStaffSecurityStorageRepository(table);
    const firstOperation = randomUUID();
    const first = await repository.reserveBinding({
      tenantId, objectId, staffId: "synthetic-owner-a",
      operationId: firstOperation
    });
    assert.equal(first.status, "committed");
    deny(first);

    const releaseOperation = randomUUID();
    const release = await repository.releaseBindingOwnership({
      tenantId, objectId, expectedStaffId: "synthetic-owner-a",
      operationId: releaseOperation
    });
    assert.equal(release.status, "committed");
    assert.equal(release.revision, 2);
    deny(release);

    const candidates = [
      { staffId: "synthetic-owner-b", operationId: randomUUID() },
      { staffId: "synthetic-owner-c", operationId: randomUUID() }
    ];
    const results = await Promise.all(candidates.map(candidate =>
      repository.reserveBinding({ tenantId, objectId, ...candidate })
    ));

    results.forEach(deny);
    assert.equal(results.filter(x => x.status === "committed").length, 1,
      "Only one successor can atomically reclaim a released binding");
    assert.equal(results.filter(x => x.status === "conflict").length, 1,
      "Losing successor must be fenced");

    const winnerIndex = results.findIndex(x => x.status === "committed");
    const winner = candidates[winnerIndex];
    const loser = candidates[1 - winnerIndex];
    const owner = await table.getEntity<{
      staffId: string; ownershipState: string; operationId: string;
    }>(partition, bindingRow);
    assert.equal(owner.staffId, winner.staffId);
    assert.equal(owner.operationId, winner.operationId);
    assert.equal(owner.ownershipState, "active");

    const headBeforeRevoke = await table.getEntity<{
      revision: number; state: string;
    }>(partition, STAFF_SECURITY_HEAD_ROW);
    assert.equal(headBeforeRevoke.revision, 3);

    // The old owner cannot release the successor's binding.
    const staleOwner = await repository.releaseBindingOwnership({
      tenantId, objectId, expectedStaffId: "synthetic-owner-a",
      operationId: randomUUID()
    });
    assert.equal(staleOwner.status, "conflict");
    deny(staleOwner);

    // Revoke the shared authority head by a conditional emulator write.
    // This is NOT a production revocation adapter.
    await table.updateEntity({
      partitionKey: partition, rowKey: STAFF_SECURITY_HEAD_ROW,
      revision: 4, state: "revoked"
    }, "Replace", { etag: headBeforeRevoke.etag });

    // Read a NEW ETag after revocation. A stale-ETag-only fence would
    // be insufficient; the repository must also reject revoked state.
    const freshRevokedHead = await table.getEntity<{
      revision: number; state: string;
    }>(partition, STAFF_SECURITY_HEAD_ROW);
    assert.equal(freshRevokedHead.state, "revoked");
    assert.equal(freshRevokedHead.revision, 4);
    assert.ok(freshRevokedHead.etag);
    assert.notEqual(freshRevokedHead.etag, headBeforeRevoke.etag);

    const afterRevocation = await Promise.all([
      repository.reserveBinding({
        tenantId, objectId, staffId: loser.staffId,
        operationId: randomUUID()
      }),
      repository.releaseBindingOwnership({
        tenantId, objectId, expectedStaffId: winner.staffId,
        operationId: randomUUID()
      })
    ]);
    afterRevocation.forEach(result => {
      assert.equal(result.status, "unavailable");
      deny(result);
    });

    const finalHead = await table.getEntity<{
      revision: number; state: string;
    }>(partition, STAFF_SECURITY_HEAD_ROW);
    const finalOwner = await table.getEntity<{
      staffId: string; operationId: string; ownershipState: string;
    }>(partition, bindingRow);
    assert.equal(finalHead.revision, 4);
    assert.equal(finalHead.state, "revoked");
    assert.equal(finalOwner.staffId, winner.staffId);
    assert.equal(finalOwner.operationId, winner.operationId);
    assert.equal(finalOwner.ownershipState, "active");

    // Historical operation receipts survive release and reassignment;
    // losing and blocked proposals have NO durable receipt.
    for (const id of [firstOperation, releaseOperation, winner.operationId]) {
      const receipt = await table.getEntity(partition, `operation-${id}`);
      assert.equal(receipt.operationId, id);
    }
    await assert.rejects(
      table.getEntity(partition, `operation-${loser.operationId}`),
      (error: unknown) =>
        (error as { statusCode?: number }).statusCode === 404
    );
    console.log("E155 local release/reassignment/revocation ordering passed");
  } finally {
    await table.deleteTable();
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
