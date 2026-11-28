"use strict";

const assert = require("node:assert/strict");
const { test, before } = require("node:test");
const { join } = require("node:path");

if (process.env.HOPE_VISITOR_88_ACCEPTANCE !== "true") {
  test("isolated request storage acceptance", {
    skip: "Explicit isolated acceptance required"
  }, () => {});
} else {
  const { TableClient } = require("@azure/data-tables");

  const {
    reservePermanentPublicVisitRequest,
    PUBLIC_VISIT_REQUEST_LIMITS
  } = require(join(
    process.env.HOPE_VISITOR_88_BUILD,
    "src/services/visitors/reservePermanentPublicVisitRequest.js"
  ));

  const tableName = "PermanentVisitorSessionQuota";

  function client(name = tableName) {
    const connection =
      process.env.HOPE_VISITOR_88_CONNECTION;

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
      process.env.HOPE_VISITOR_88_PORT
    );

    assert.notEqual(endpoint.port, "10002");

    assert.equal(
      endpoint.pathname.replace(/\/$/, ""),
      "/hopevisitor88"
    );

    return table;
  }

  const table = client();

  const now = Date.parse(
    "2026-11-24T17:00:00Z"
  );

  function partition(operation, clock) {
    return `pv-request-v1-${operation}-${Math.floor(clock / 60000)}`;
  }

  async function read(operation, clock) {
    return table.getEntity(
      partition(operation, clock),
      "budget"
    );
  }

  before(async () => {
    assert.equal(
      PUBLIC_VISIT_REQUEST_LIMITS.session,
      120
    );

    assert.equal(
      PUBLIC_VISIT_REQUEST_LIMITS.registration,
      180
    );

    await table.createTable();

    console.log("EXACT_ISOLATED_STORAGE_ENDPOINT_VERIFIED=True");
  });

  test("independent clients preserve durable counts during concurrent creation", async () => {
    const results = await Promise.all(
      Array.from({ length: 16 }, () =>
        reservePermanentPublicVisitRequest(
          client(), "session", now
        )
      )
    );

    const reserved = results.filter(
      result => result === "reserved"
    ).length;

    const unavailable = results.filter(
      result => result === "unavailable"
    ).length;

    assert.equal(reserved, 16);

    assert.equal(
      unavailable,
      0
    );

    const persisted = await read("session", now);

    assert.equal(persisted.count, reserved);
    assert.equal(persisted.version, 1);

    assert.ok(
      typeof persisted.etag === "string" &&
      persisted.etag.length > 0 &&
      persisted.etag !== "*"
    );

    assert.deepEqual(
      Object.keys(persisted).filter(key =>
        !["partitionKey", "rowKey", "etag",
          "timestamp", "odata.metadata"].includes(key)
      ).sort(),
      ["count", "version"]
    );

    console.log("CONCURRENT_REQUESTS=16");
    console.log("CONCURRENT_RESERVED=" + reserved);
    console.log("CONCURRENT_UNAVAILABLE=" + unavailable);
    console.log("NO_LOST_COUNTER_UPDATES=True");
  });

  test("actual concurrent storage writes enforce both exact capacity boundaries", async () => {
    const clock = now + 60000;

    for (const operation of [
      "session", "registration"
    ]) {
      const limit =
        PUBLIC_VISIT_REQUEST_LIMITS[operation];

      // Seed a synthetic near-capacity counter
      // to exercise the real conditional write.
      await table.createEntity({
        partitionKey: partition(operation, clock),
        rowKey: "budget",
        version: 1,
        count: limit - 1
      });

      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          reservePermanentPublicVisitRequest(
            client(), operation, clock
          )
        )
      );

      assert.equal(
        results.filter(x => x === "reserved").length,
        1
      );

      assert.ok(results.every(result =>
        ["reserved", "capacity_exhausted",
          "unavailable"].includes(result)
      ));

      const full = await read(operation, clock);

      assert.equal(full.count, limit);

      assert.equal(
        await reservePermanentPublicVisitRequest(
          client(), operation, clock
        ),
        "capacity_exhausted"
      );

      const after = await read(operation, clock);

      assert.equal(after.count, limit);
      assert.equal(after.etag, full.etag);

      console.log(
        "EXACT_DURABLE_LIMIT=" +
        operation + ":" + limit
      );

      console.log(
        "CONCURRENT_OVERSHOOT=" +
        operation + ":0"
      );
    }
  });

  test("new minutes and operation budgets remain independent", async () => {
    const clock = now + 120000;

    assert.equal(
      await reservePermanentPublicVisitRequest(
        client(), "session", clock
      ),
      "reserved"
    );

    assert.equal(
      await reservePermanentPublicVisitRequest(
        client(), "registration", clock
      ),
      "reserved"
    );

    assert.equal(
      (await read("session", clock)).count,
      1
    );

    assert.equal(
      (await read("registration", clock)).count,
      1
    );

    assert.equal(
      (await read("session", clock - 60000)).count,
      120
    );

    assert.equal(
      (await read("registration", clock - 60000)).count,
      180
    );

    console.log("DURABLE_MINUTE_ROLLOVER_VERIFIED=True");
    console.log("INDEPENDENT_OPERATION_BUDGETS_VERIFIED=True");
  });

  test("missing storage table fails closed without provisioning", async () => {
    const missing = client(
      "UnprovisionedRequestBudget88"
    );

    assert.equal(
      await reservePermanentPublicVisitRequest(
        missing, "session", now
      ),
      "unavailable"
    );

    await assert.rejects(
      () => missing.getEntity(
        partition("session", now),
        "budget"
      ),
      error => error.statusCode === 404
    );

    console.log("MISSING_STORAGE_TABLE_FAILS_CLOSED=True");
  });
}
