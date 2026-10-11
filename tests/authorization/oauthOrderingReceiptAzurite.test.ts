import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  OAuthOrderingReceiptStorageRepository,
  OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
  type OAuthOrderingReceiptTablePort,
  type OAuthOrderingReceiptTableEntity
} from "../../src/repositories/oauthOrderingReceiptStorageRepository";

import {
  initialOAuthOrderingReceiptEnvelope,
  isOAuthOrderingReceiptEnvelope,
  type OAuthOrderingReceiptEnvelope
} from "../../src/services/authorization/modelOAuthOrderingTransitionReceipts";

/**
 * Emulator-only test. No connection string from an
 * external service is ever used to construct the client.
 */
if (process.env.STORAGE_CONNECTION_STRING !==
    "UseDevelopmentStorage=true") {
  throw Error("Local Azurite configuration required");
}

const port =
  process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";

if (port !== "10002" && port !== "11002") {
  throw Error("Unapproved local Azurite Table port");
}

const connectionString = port === "10002"
  ? "UseDevelopmentStorage=true"
  : [
      "DefaultEndpointsProtocol=http",
      "AccountName=devstoreaccount1",
      "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
      "TableEndpoint=http://127.0.0.1:11002/devstoreaccount1"
    ].join(";");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function main(): Promise<void> {
  const tableName =
    "OauthReceiptV2IT" + randomBytes(10).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    tableName,
    { allowInsecureConnection: true }
  );

  await table.createTable();

  try {
    const adapter: OAuthOrderingReceiptTablePort = {
      async getEntity(partitionKey, rowKey) {
        const entity = await table.getEntity<{
          envelopeJson: string
        }>(partitionKey, rowKey);

        return {
          partitionKey: entity.partitionKey,
          rowKey: entity.rowKey,
          envelopeJson: entity.envelopeJson,
          etag: entity.etag
        } as OAuthOrderingReceiptTableEntity;
      },

      async updateEntity(entity, mode, options) {
        return table.updateEntity(entity, mode, options);
      }
    };

    async function stored(): Promise<{
      envelope: OAuthOrderingReceiptEnvelope;
      etag: string;
    }> {
      const entity = await table.getEntity<{
        envelopeJson: string;
      }>(OAUTH_ORDERING_RECEIPT_PARTITION_KEY, ID);

      const parsed: unknown = JSON.parse(entity.envelopeJson);

      assert.equal(
        isOAuthOrderingReceiptEnvelope(parsed),
        true,
        "Persisted state and receipts must form a valid chain"
      );

      return {
        envelope: parsed as OAuthOrderingReceiptEnvelope,
        etag: entity.etag
      };
    }

    const initial = initialOAuthOrderingReceiptEnvelope();

    await table.createEntity({
      partitionKey: OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
      rowKey: ID,
      envelopeJson: JSON.stringify(initial)
    });

    const attempts: string[] = Array.from(
      { length: 30 },
      () => randomUUID()
    );

    // Real concurrent SDK requests against one V2 entity.
    const decisions = await Promise.all(
      attempts.map(attemptId =>
        new OAuthOrderingReceiptStorageRepository(
          adapter
        ).tryTransition(ID, attemptId, {
          kind: "claim",
          expectedRevision: 0,
          claimId: "synthetic-worker"
        })
      )
    );

    assert.equal(
      decisions.filter(r => r.outcome === "committed").length,
      1,
      "Only one conditional receipt-bearing write may win"
    );

    assert.equal(
      decisions.filter(r => r.outcome === "denied").length,
      29
    );

    assert.ok(decisions.every(
      r => r.executionPermitted === false &&
        r.retryPermitted === false
    ));

    const afterClaim = await stored();

    assert.equal(afterClaim.envelope.snapshot.revision, 1);
    assert.equal(afterClaim.envelope.snapshot.state, "claimed");
    assert.equal(afterClaim.envelope.receipts.length, 1);

    const winner =
      afterClaim.envelope.receipts[0].attemptId;

    assert.ok(
      attempts.includes(winner),
      "The committed receipt identifies one competing attempt"
    );

    assert.equal(
      afterClaim.envelope.receipts[0].fromRevision,
      0
    );
    assert.equal(
      afterClaim.envelope.receipts[0].toRevision,
      1
    );

    // Duplicate attempt cannot create a second receipt.
    const duplicate =
      await new OAuthOrderingReceiptStorageRepository(
        adapter
      ).tryTransition(ID, winner, {
        kind: "revoke",
        expectedRevision: 1,
        source: "staff_deactivation"
      });

    assert.equal(duplicate.outcome, "denied");

    // A different attempt must preserve previous evidence.
    const revocationId = randomUUID();

    const revocation =
      await new OAuthOrderingReceiptStorageRepository(
        adapter
      ).tryTransition(ID, revocationId, {
        kind: "revoke",
        expectedRevision: 1,
        source: "staff_deactivation"
      });

    assert.equal(revocation.outcome, "committed");
    assert.equal(revocation.executionPermitted, false);
    assert.equal(revocation.retryPermitted, false);

    const afterRevocation = await stored();

    assert.equal(
      afterRevocation.envelope.snapshot.state,
      "revocation_pending"
    );
    assert.equal(
      afterRevocation.envelope.snapshot.revision,
      2
    );
    assert.deepEqual(
      afterRevocation.envelope.receipts.map(
        receipt => receipt.attemptId
      ),
      [winner, revocationId]
    );

    // The previously read ETag must now be stale.
    let staleRejected = false;

    try {
      await table.updateEntity({
        partitionKey: OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
        rowKey: ID,
        envelopeJson: JSON.stringify(afterClaim.envelope)
      }, "Replace", {
        etag: afterClaim.etag
      });
    } catch (error) {
      staleRejected =
        (error as { statusCode?: number }).statusCode === 412;
    }

    assert.equal(
      staleRejected,
      true,
      "Azurite must reject stale If-Match receipts"
    );

    // Stale write must not erase stored receipt history.
    const afterConflict = await stored();

    assert.deepEqual(
      afterConflict.envelope.receipts.map(
        receipt => receipt.attemptId
      ),
      [winner, revocationId]
    );

    // No implicit V1 migration or missing-entity creation.
    const missing =
      await new OAuthOrderingReceiptStorageRepository(
        adapter
      ).tryTransition(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        randomUUID(),
        {
          kind: "claim",
          expectedRevision: 0,
          claimId: "missing"
        }
      );

    assert.equal(missing.outcome, "denied");

    console.log(
      "OAuth V2 atomic transition receipts Azurite tests passed"
    );
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
