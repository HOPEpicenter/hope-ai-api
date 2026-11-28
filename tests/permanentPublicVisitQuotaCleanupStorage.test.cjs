"use strict";

const assert = require("node:assert/strict");
const { test, before } = require("node:test");
const { join } = require("node:path");

if (process.env.HOPE_VISITOR_93_ACCEPTANCE !== "true") {
  test("isolated quota cleanup acceptance", {
    skip: "Explicit isolated acceptance required"
  }, () => {});
} else {
  const { TableClient } = require("@azure/data-tables");

  const {
    cleanupPermanentPublicVisitQuotaMinute: cleanup,
    QUOTA_RETENTION_MINUTES
  } = require(join(
    process.env.HOPE_VISITOR_93_BUILD,
    "src/services/visitors/cleanupPermanentPublicVisitQuota.js"
  ));

  function client(name) {
    const connection =
      process.env.HOPE_VISITOR_93_CONNECTION;

    assert.ok(connection);

    const table = TableClient.fromConnectionString(
      connection,
      name,
      { allowInsecureConnection: true }
    );

    const endpoint = new URL(table.url);

    assert.equal(endpoint.protocol, "http:");
    assert.equal(endpoint.hostname, "127.0.0.1");

    assert.equal(
      endpoint.port,
      process.env.HOPE_VISITOR_93_PORT
    );

    assert.notEqual(endpoint.port, "10002");

    assert.equal(
      endpoint.pathname.replace(/\/$/, ""),
      "/hopevisitor93"
    );

    return table;
  }

  const table = client(
    "PermanentVisitorSessionQuota"
  );

  const canonical = client("Visitors");

  const now = Date.parse(
    "2026-11-24T19:00:00Z"
  );

  const current = Math.floor(now / 60000);

  const expired =
    current - QUOTA_RETENTION_MINUTES - 10;

  const receipt = {
    partitionKey: "VISITOR_CHECK_IN",
    rowKey: "synthetic-protected-receipt",
    version: 1
  };

  const recent = {
    partitionKey: `pv-session-v1-${current}`,
    rowKey: "slot-000",
    version: 1
  };

  async function seed(minute) {
    const entities = [
      {
        partitionKey: `pv-session-v1-${minute}`,
        rowKey: "slot-000",
        version: 1
      },
      {
        partitionKey:
          `pv-request-v1-session-${minute}`,
        rowKey: "budget",
        version: 1,
        count: 120
      },
      {
        partitionKey:
          `pv-request-v1-registration-${minute}`,
        rowKey: "budget",
        version: 1,
        count: 180
      }
    ];

    for (const entity of entities) {
      await table.createEntity(entity);
    }

    return entities;
  }

  async function assertPreserved(entity) {
    const saved = await table.getEntity(
      entity.partitionKey,
      entity.rowKey
    );

    assert.equal(saved.version, entity.version);

    if ("count" in entity) {
      assert.equal(saved.count, entity.count);
    }

    return saved;
  }

  before(async () => {
    assert.equal(
      QUOTA_RETENTION_MINUTES,
      7 * 24 * 60
    );

    await table.createTable();
    await canonical.createTable();

    await table.createEntity(recent);

    // Synthetic unrelated record inside quota table.
    await table.createEntity(receipt);

    // Synthetic canonical record in a separate table.
    await canonical.createEntity(receipt);

    console.log(
      "ALL_TEST_STORAGE_ENDPOINTS_ISOLATED=True"
    );
  });

  test("actual expired quota inspection performs zero deletions", async () => {
    const entities = await seed(expired);

    assert.deepEqual(
      await cleanup(table, expired, now),
      {
        status: "planned",
        eligible: 3,
        deleted: 0
      }
    );

    for (const entity of entities) {
      await assertPreserved(entity);
    }

    console.log(
      "ACTUAL_DRY_RUN_ZERO_DELETIONS=True"
    );
  });

  test("actual cleanup removes only selected expired quotas and preserves protected records", async () => {
    const minute = expired - 1;

    const entities = await seed(minute);

    assert.deepEqual(
      await cleanup(table, minute, now, true),
      {
        status: "cleaned",
        eligible: 3,
        deleted: 3
      }
    );

    for (const entity of entities) {
      await assert.rejects(
        () => table.getEntity(
          entity.partitionKey,
          entity.rowKey
        ),
        error => error.statusCode === 404
      );
    }

    await assertPreserved(recent);
    await assertPreserved(receipt);

    const canonicalReceipt =
      await canonical.getEntity(
        receipt.partitionKey,
        receipt.rowKey
      );

    assert.equal(canonicalReceipt.version, 1);

    assert.deepEqual(
      await cleanup(table, minute, now, true),
      {
        status: "cleaned",
        eligible: 0,
        deleted: 0
      }
    );

    console.log(
      "EXPIRED_QUOTA_RECORDS_DELETED=3"
    );

    console.log(
      "RECENT_AND_CANONICAL_RECORDS_PRESERVED=True"
    );

    console.log(
      "REPEATED_CLEANUP_SAFE=True"
    );
  });

  test("actual storage rejects deletion after a concurrent quota update", async () => {
    const minute = expired - 2;

    const entity = {
      partitionKey:
        `pv-request-v1-session-${minute}`,
      rowKey: "budget",
      version: 1,
      count: 1
    };

    await table.createEntity(entity);

    let conflict = false;

    const concurrentTable = {
      listEntities: options =>
        table.listEntities(options),

      async deleteEntity(partitionKey, rowKey, options) {
        assert.equal(
          partitionKey,
          entity.partitionKey
        );

        assert.equal(rowKey, entity.rowKey);
        assert.notEqual(options.etag, "*");

        // Change the actual stored ETag after
        // inspection, before conditional deletion.
        await table.updateEntity(
          {
            ...entity,
            count: 2
          },
          "Merge",
          { etag: options.etag }
        );

        try {
          await table.deleteEntity(
            partitionKey,
            rowKey,
            options
          );
        } catch (error) {
          assert.equal(error.statusCode, 412);
          conflict = true;
          throw error;
        }
      }
    };

    assert.deepEqual(
      await cleanup(
        concurrentTable, minute, now, true
      ),
      {
        status: "unavailable",
        eligible: 1,
        deleted: 0
      }
    );

    assert.equal(conflict, true);

    await assertPreserved({
      ...entity,
      count: 2
    });

    console.log(
      "ACTUAL_STALE_ETAG_DELETION_DENIED=True"
    );

    console.log(
      "CONCURRENTLY_CHANGED_RECORD_PRESERVED=True"
    );
  });

  test("an unexpected stored property prevents all selected deletions", async () => {
    const minute = expired - 3;

    const entities = await seed(minute);

    const unexpected = entities[2];

    const saved = await assertPreserved(
      unexpected
    );

    await table.updateEntity(
      {
        ...unexpected,
        unexpectedField: "synthetic"
      },
      "Merge",
      { etag: saved.etag }
    );

    assert.deepEqual(
      await cleanup(table, minute, now, true),
      {
        status: "unavailable",
        eligible: 0,
        deleted: 0
      }
    );

    for (const entity of entities) {
      await assertPreserved(entity);
    }

    const preserved = await table.getEntity(
      unexpected.partitionKey,
      unexpected.rowKey
    );

    assert.equal(
      preserved.unexpectedField,
      "synthetic"
    );

    console.log(
      "UNKNOWN_STORED_PROPERTY_FAILS_CLOSED=True"
    );
  });
}
