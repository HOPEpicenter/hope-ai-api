import assert from "node:assert/strict";
import { test } from "node:test";
import { TableClient, type TableEntity, type TableEntityResult } from "@azure/data-tables";
import { recordVisitorArrival } from "../../src/services/visitors/recordVisitorArrival";

const arrival = {
  submissionId: "11111111-2222-4333-8444-555555555555",
  serviceId: "sunday-test",
  name: "Synthetic Visitor",
  email: "guest@example.test"
};

function fixture() {
  const rows = new Map<string, TableEntity>();
  const failures = { beforeProfile: false, afterProfile: false, beforeVisit: false };
  const table = Object.assign(new TableClient("http://127.0.0.1:10002", "Visitors"), {
    async createTable() {},
    async createEntity(entity: TableEntity) {
      const key = `${entity.partitionKey}/${entity.rowKey}`;
      if (rows.has(key)) throw { statusCode: 409 };
      if (entity.partitionKey === "VISITOR" && failures.beforeProfile) {
        throw new Error("profile unavailable");
      }
      if (entity.partitionKey === "VISITOR_CHECK_IN" && failures.beforeVisit) {
        throw new Error("visit unavailable");
      }
      rows.set(key, { ...entity });
      if (entity.partitionKey === "VISITOR" && failures.afterProfile) {
        throw new Error("profile acknowledgement lost");
      }
      return { etag: "synthetic" };
    },
    async getEntity<T extends object>(partitionKey: string, rowKey: string) {
      const row = rows.get(`${partitionKey}/${rowKey}`);
      if (!row) throw { statusCode: 404 };
      return { ...row, etag: "synthetic" } as TableEntityResult<T>;
    }
  } satisfies Pick<TableClient, "createTable" | "createEntity" | "getEntity">);
  return {
    rows, failures,
    dependencies: { table, resolveIdentity: async () => ({ status: "unmatched" as const }) },
    count: (partition: string) => [...rows.values()].filter(row => row.partitionKey === partition).length
  };
}

test("concurrent first-time check-ins create one canonical profile, contact index and visit", async () => {
  const { dependencies, count } = fixture();
  const [one, two] = await Promise.all([
    recordVisitorArrival(arrival, dependencies),
    recordVisitorArrival(arrival, dependencies)
  ]);
  assert.equal(one.status, "recorded");
  assert.deepEqual(one, two);
  assert.equal(count("VISITOR"), 1);
  assert.equal(count("VISITOR_CHECK_IN"), 1);
  assert.equal(count("EMAIL"), 1);
});

test("a retry recovers partial creation and records the visit only when it can save", async () => {
  const { dependencies, failures, count } = fixture();
  failures.beforeProfile = true;
  await assert.rejects(recordVisitorArrival(arrival, dependencies), /profile unavailable/);
  assert.equal(count("EMAIL"), 1);
  assert.equal(count("VISITOR"), 0);
  failures.beforeProfile = false;
  failures.afterProfile = true;
  failures.beforeVisit = true;
  await assert.rejects(recordVisitorArrival(arrival, dependencies), /visit unavailable/);
  assert.equal(count("VISITOR"), 1);
  assert.equal(count("VISITOR_CHECK_IN"), 0);
  failures.beforeVisit = false;
  assert.equal((await recordVisitorArrival(arrival, dependencies)).status, "recorded");
  assert.equal(count("VISITOR"), 1);
  assert.equal(count("VISITOR_CHECK_IN"), 1);
});

test("the same submission cannot change identity, and a reserved contact cannot create a second profile", async () => {
  const { dependencies, count } = fixture();
  assert.equal((await recordVisitorArrival(arrival, dependencies)).status, "recorded");
  assert.deepEqual(await recordVisitorArrival({
    ...arrival, email: "other@example.test"
  }, dependencies), { status: "submission_conflict" });
  assert.deepEqual(await recordVisitorArrival({
    ...arrival, submissionId: "21111111-2222-4333-8444-555555555555"
  }, dependencies), { status: "requires_staff_review" });
  assert.equal(count("VISITOR"), 1);
  assert.equal(count("VISITOR_CHECK_IN"), 1);
});
