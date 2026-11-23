import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableClient, TableEntity, TableEntityResult } from "@azure/data-tables";
import { recordVisitorCheckIn } from "../../src/services/visitors/recordVisitorCheckIn";

const command = {
  submissionId: "11111111-2222-4333-8444-555555555555",
  visitorId: "visitor-a",
  serviceId: "sunday-2026-11-29"
};
const recordedAt = "2026-11-29T15:00:00.000Z";

function fixture() {
  const rows = new Map<string, TableEntity>();
  const failures = { beforeWrite: false, afterWrite: false };
  const table: Pick<TableClient, "createTable" | "createEntity" | "getEntity"> = {
    async createTable() {},
    async createEntity(entity: TableEntity) {
      if (failures.beforeWrite) throw new Error("storage unavailable");
      const key = `${entity.partitionKey}/${entity.rowKey}`;
      if (rows.has(key)) throw { statusCode: 409 };
      rows.set(key, { ...entity });
      if (failures.afterWrite) throw new Error("acknowledgement lost");
      return { etag: "synthetic" };
    },
    async getEntity<T extends object>(partitionKey: string, rowKey: string) {
      const row = rows.get(`${partitionKey}/${rowKey}`);
      if (!row) throw { statusCode: 404 };
      return { ...row, etag: "synthetic" } as TableEntityResult<T>;
    }
  };
  return {
    rows, failures,
    dependencies: {
      table,
      now: () => new Date(recordedAt),
      readVisitor: async (visitorId: string) => visitorId === "missing" ? null : {
        visitorId,
        name: "Synthetic visitor",
        createdAt: recordedAt,
        updatedAt: recordedAt
      }
    }
  };
}

test("concurrent retries share a single receipt and a later visit gets its own row", async () => {
  const { rows, dependencies } = fixture();
  const expected = { status: "recorded", receipt: { ...command, recordedAt } };
  assert.deepEqual(await Promise.all([
    recordVisitorCheckIn(command, dependencies),
    recordVisitorCheckIn(command, dependencies)
  ]), [expected, expected]);
  assert.equal(rows.size, 1);
  assert.equal(JSON.stringify([...rows.values()]).includes("Synthetic visitor"), false);

  const later = {
    ...command,
    submissionId: "21111111-2222-4333-8444-555555555555",
    serviceId: "sunday-2026-12-06"
  };
  assert.deepEqual(await recordVisitorCheckIn(later, dependencies), {
    status: "recorded", receipt: { ...later, recordedAt }
  });
  assert.equal(rows.size, 2);
});

test("a lost acknowledgement can be recovered but a failed save cannot return success", async () => {
  const { rows, failures, dependencies } = fixture();
  failures.beforeWrite = true;
  await assert.rejects(recordVisitorCheckIn(command, dependencies), /storage unavailable/);
  assert.equal(rows.size, 0);

  failures.beforeWrite = false;
  failures.afterWrite = true;
  const saved = await recordVisitorCheckIn(command, dependencies);
  assert.equal(saved.status, "recorded");
  const retry = await recordVisitorCheckIn(command, {
    ...dependencies,
    now: () => new Date("2026-11-30T00:00:00.000Z")
  });
  assert.deepEqual(retry, saved);
  assert.equal(rows.size, 1);
});

test("invalid, unresolved and conflicting submissions cannot add rows", async () => {
  const { rows, dependencies } = fixture();
  assert.deepEqual(await recordVisitorCheckIn({
    ...command, submissionId: "invalid"
  }, dependencies), { status: "invalid" });
  assert.deepEqual(await recordVisitorCheckIn({
    ...command, visitorId: "missing"
  }, dependencies), { status: "visitor_not_found" });
  assert.equal(rows.size, 0);

  await recordVisitorCheckIn(command, dependencies);
  for (const changed of [{ visitorId: "visitor-b" }, { serviceId: "another-service" }]) {
    assert.deepEqual(await recordVisitorCheckIn({
      ...command, ...changed
    }, dependencies), { status: "submission_conflict" });
  }
  assert.equal(rows.size, 1);
});
