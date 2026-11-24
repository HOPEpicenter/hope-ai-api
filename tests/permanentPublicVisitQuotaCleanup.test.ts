import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  cleanupPermanentPublicVisitQuotaMinute as cleanup,
  QUOTA_RETENTION_MINUTES,
  type QuotaCleanupTable
} from "../src/services/visitors/cleanupPermanentPublicVisitQuota";

const now = Date.parse("2026-11-24T19:00:00Z");

const current = Math.floor(now / 60000);

const expired =
  current - QUOTA_RETENTION_MINUTES - 1;

type Row = {
  partitionKey: string;
  rowKey: string;
  etag: string;
  version: number;
  count?: number;
  [key: string]: unknown;
};

function fixture() {
  const rows: Row[] = [
    {
      partitionKey: `pv-session-v1-${expired}`,
      rowKey: "slot-000",
      version: 1,
      etag: "issuance-etag"
    },
    {
      partitionKey: `pv-request-v1-session-${expired}`,
      rowKey: "budget",
      version: 1,
      count: 120,
      etag: "session-etag"
    },
    {
      partitionKey: `pv-request-v1-registration-${expired}`,
      rowKey: "budget",
      version: 1,
      count: 180,
      etag: "registration-etag"
    },
    {
      partitionKey: `pv-session-v1-${current}`,
      rowKey: "slot-000",
      version: 1,
      etag: "recent-etag"
    },
    {
      partitionKey: "VISITOR_CHECK_IN",
      rowKey: "synthetic-protected-receipt",
      version: 1,
      etag: "protected-etag"
    }
  ];

  const state = {
    reads: 0,
    deletes: 0,
    failRead: false,
    failDelete: false
  };

  const table = {
    async *listEntities(options: {
      queryOptions: { filter: string }
    }) {
      state.reads++;

      if (state.failRead) {
        throw new Error("Synthetic read failure");
      }

      for (const row of rows) {
        if (
          options.queryOptions.filter ===
          `PartitionKey eq '${row.partitionKey}'`
        ) {
          yield { ...row };
        }
      }
    },

    async deleteEntity(
      partitionKey: string,
      rowKey: string,
      options: { etag: string }
    ) {
      state.deletes++;

      if (state.failDelete) {
        throw { statusCode: 412 };
      }

      const index = rows.findIndex(row =>
        row.partitionKey === partitionKey &&
        row.rowKey === rowKey
      );

      assert.ok(index >= 0);
      assert.equal(options.etag, rows[index].etag);
      assert.notEqual(options.etag, "*");

      rows.splice(index, 1);
    }
  } as unknown as QuotaCleanupTable;

  return { table, rows, state };
}

test("expired quota inspection defaults to zero deletions", async () => {
  const f = fixture();

  assert.deepEqual(
    await cleanup(f.table, expired, now),
    { status: "planned", eligible: 3, deleted: 0 }
  );

  assert.equal(f.state.reads, 3);
  assert.equal(f.state.deletes, 0);
  assert.equal(f.rows.length, 5);
});

test("explicit cleanup deletes only expired quota records with exact etags", async () => {
  const f = fixture();

  assert.deepEqual(
    await cleanup(f.table, expired, now, true),
    { status: "cleaned", eligible: 3, deleted: 3 }
  );

  assert.equal(f.rows.length, 2);

  assert.ok(f.rows.some(row =>
    row.partitionKey === `pv-session-v1-${current}`
  ));

  assert.ok(f.rows.some(row =>
    row.partitionKey === "VISITOR_CHECK_IN"
  ));
});

test("recent boundary future and invalid minutes never access storage", async () => {
  const f = fixture();

  for (const minute of [
    current - QUOTA_RETENTION_MINUTES,
    current,
    current + 1,
    -1,
    NaN,
    1.5
  ]) {
    assert.deepEqual(
      await cleanup(f.table, minute, now, true),
      { status: "ineligible", eligible: 0, deleted: 0 }
    );
  }

  assert.equal(f.state.reads, 0);
  assert.equal(f.state.deletes, 0);
});

test("unknown fields prevent all deletion", async () => {
  const f = fixture();

  f.rows[2].unexpectedVisitorData = "synthetic";

  assert.equal(
    (await cleanup(f.table, expired, now, true)).status,
    "unavailable"
  );

  assert.equal(f.state.deletes, 0);
});

test("wildcard etags and invalid quota shapes are rejected", async () => {
  const f = fixture();

  f.rows[0].etag = "*";

  assert.equal(
    (await cleanup(f.table, expired, now, true)).status,
    "unavailable"
  );

  f.rows[0].etag = "valid-etag";
  f.rows[1].count = 121;

  assert.equal(
    (await cleanup(f.table, expired, now, true)).status,
    "unavailable"
  );

  assert.equal(f.state.deletes, 0);
});

test("unexpected row keys and duplicate rows fail closed", async () => {
  const f = fixture();

  f.rows[0].rowKey = "slot-060";

  assert.equal(
    (await cleanup(f.table, expired, now, true)).status,
    "unavailable"
  );

  f.rows[0].rowKey = "slot-000";

  f.rows.push({ ...f.rows[0] });

  assert.equal(
    (await cleanup(f.table, expired, now, true)).status,
    "unavailable"
  );

  assert.equal(f.state.deletes, 0);
});

test("read failure and conditional deletion conflict fail closed", async () => {
  const f = fixture();

  f.state.failRead = true;

  assert.equal(
    (await cleanup(f.table, expired, now, true)).status,
    "unavailable"
  );

  assert.equal(f.state.deletes, 0);

  f.state.failRead = false;
  f.state.failDelete = true;

  assert.deepEqual(
    await cleanup(f.table, expired, now, true),
    { status: "unavailable", eligible: 3, deleted: 0 }
  );

  assert.equal(f.state.deletes, 1);
  assert.equal(f.rows.length, 5);
});

test("repeated cleanup cannot delete protected rows", async () => {
  const f = fixture();

  assert.equal(
    (await cleanup(f.table, expired, now, true)).deleted,
    3
  );

  assert.deepEqual(
    await cleanup(f.table, expired, now, true),
    { status: "cleaned", eligible: 0, deleted: 0 }
  );

  assert.equal(f.state.deletes, 3);
  assert.equal(f.rows.length, 2);
});
