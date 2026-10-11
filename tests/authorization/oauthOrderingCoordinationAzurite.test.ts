import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  OAuthOrderingCoordinationRepository,
  OAUTH_ORDERING_PARTITION_KEY,
  type OAuthOrderingTablePort,
  type OAuthOrderingTableEntity
} from "../../src/repositories/oauthOrderingCoordinationRepository";

import {
  initialOAuthOrderingSnapshot,
  type OAuthOrderingSnapshot
} from "../../src/services/authorization/modelOAuthRevocationOrdering";

/**
 * Local Azurite integration only.
 *
 * This test provisions an isolated emulator table. It never
 * connects to Azure or operates on live OAuth credentials.
 */
if (process.env.STORAGE_CONNECTION_STRING !== "UseDevelopmentStorage=true") {
  throw Error("Azurite test requires emulator-only storage");
}

const port = process.env.HOPE_OAUTH_AZURITE_TABLE_PORT ?? "10002";

if (port !== "10002" && port !== "11002") {
  throw Error("Unapproved Azurite Table port");
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
    "OauthOrderingIT" + randomBytes(10).toString("hex");

  const table = TableClient.fromConnectionString(
    connectionString,
    tableName,
    { allowInsecureConnection: true }
  );

  await table.createTable();

  try {
    const adapter: OAuthOrderingTablePort = {
      async getEntity(partitionKey, rowKey) {
        const entity = await table.getEntity<{
          snapshotJson: string;
        }>(partitionKey, rowKey);

        return {
          partitionKey: entity.partitionKey,
          rowKey: entity.rowKey,
          snapshotJson: entity.snapshotJson,
          etag: entity.etag
        } as OAuthOrderingTableEntity;
      },

      async updateEntity(entity, mode, options) {
        return table.updateEntity(entity, mode, options);
      }
    };

    async function stored(): Promise<{
      state: OAuthOrderingSnapshot;
      etag: string;
    }> {
      const entity = await table.getEntity<{
        snapshotJson: string;
      }>(OAUTH_ORDERING_PARTITION_KEY, ID);

      return {
        state: JSON.parse(
          entity.snapshotJson
        ) as OAuthOrderingSnapshot,
        etag: entity.etag
      };
    }

    async function reset(): Promise<void> {
      const current = await stored();
      await table.updateEntity(
        {
          partitionKey: OAUTH_ORDERING_PARTITION_KEY,
          rowKey: ID,
          snapshotJson: JSON.stringify(
            initialOAuthOrderingSnapshot()
          )
        },
        "Replace",
        { etag: current.etag }
      );
    }

    await table.createEntity({
      partitionKey: OAUTH_ORDERING_PARTITION_KEY,
      rowKey: ID,
      snapshotJson: JSON.stringify(
        initialOAuthOrderingSnapshot()
      )
    });

    // Thirty real SDK calls race against one entity.
    const claimResults = await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        new OAuthOrderingCoordinationRepository(
          adapter
        ).tryTransition(ID, {
          kind: "claim",
          expectedRevision: 0,
          claimId: `claim-${index}`
        })
      )
    );

    assert.equal(
      claimResults.filter(r => r.outcome === "committed").length,
      1,
      "Exactly one ETag-conditional claim must commit"
    );

    assert.equal(
      claimResults.filter(r => r.outcome === "denied").length,
      29
    );

    assert.ok(
      claimResults.every(r => r.executionPermitted === false)
    );

    const afterClaims = await stored();
    assert.equal(afterClaims.state.revision, 1);
    assert.equal(afterClaims.state.state, "claimed");

    // A stale expected revision is denied.
    const stale = await new OAuthOrderingCoordinationRepository(
      adapter
    ).tryTransition(ID, {
      kind: "claim",
      expectedRevision: 0,
      claimId: "stale"
    });

    assert.equal(stale.outcome, "denied");

    // Explicit Azure Table HTTP 412 verification.
    const previousEtag = afterClaims.etag;

    await table.updateEntity(
      {
        partitionKey: OAUTH_ORDERING_PARTITION_KEY,
        rowKey: ID,
        snapshotJson: JSON.stringify(afterClaims.state)
      },
      "Replace",
      { etag: previousEtag }
    );

    let saw412 = false;

    try {
      await table.updateEntity(
        {
          partitionKey: OAUTH_ORDERING_PARTITION_KEY,
          rowKey: ID,
          snapshotJson: JSON.stringify(afterClaims.state)
        },
        "Replace",
        { etag: previousEtag }
      );
    } catch (error) {
      saw412 =
        (error as { statusCode?: number }).statusCode === 412;
    }

    assert.equal(saw412, true, "Stale ETag must receive 412");

    await reset();

    // Competing claim/revocation:
    // only one can commit revision zero.
    const raceResults = await Promise.all([
      new OAuthOrderingCoordinationRepository(
        adapter
      ).tryTransition(ID, {
        kind: "claim",
        expectedRevision: 0,
        claimId: "claim-final"
      }),
      new OAuthOrderingCoordinationRepository(
        adapter
      ).tryTransition(ID, {
        kind: "revoke",
        expectedRevision: 0,
        source: "staff_deactivation"
      })
    ]);

    assert.equal(
      raceResults.filter(r => r.outcome === "committed").length,
      1
    );

    assert.equal(
      raceResults.filter(r => r.outcome === "denied").length,
      1
    );

    const afterRace = await stored();

    assert.equal(afterRace.state.revision, 1);
    assert.ok(
      afterRace.state.state === "claimed" ||
      afterRace.state.state === "revoked"
    );

    // If claim wins first, a subsequent revocation
    // commits only as pending. It never cancels work.
    if (afterRace.state.state === "claimed") {
      const pending =
        await new OAuthOrderingCoordinationRepository(
          adapter
        ).tryTransition(ID, {
          kind: "revoke",
          expectedRevision: 1,
          source: "session_revocation"
        });

      assert.equal(pending.outcome, "committed");

      const afterPending = await stored();
      assert.equal(
        afterPending.state.state,
        "revocation_pending"
      );
    }

    // Missing coordination records fail closed.
    const missing =
      await new OAuthOrderingCoordinationRepository(
        adapter
      ).tryTransition(
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        {
          kind: "claim",
          expectedRevision: 0,
          claimId: "missing"
        }
      );

    assert.equal(missing.outcome, "denied");

    console.log(
      "OAuth ordering Azurite atomic conditional-commit tests passed"
    );
  } finally {
    await table.deleteTable();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
