import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import type { TableClient, TransactionAction } from "@azure/data-tables";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";
import { createPermanentVisitorConsentRepository as repository } from "../src/repositories/permanentVisitorConsentRepository";
import { permitsContactWork } from "../src/domain/followups/permanentVisitorConsentAuthority";

type Port = Parameters<typeof repository>[0];
const visitor = "synthetic-visitor";
const pk = `consent-v1:${visitor}`;
const init = { kind: "new_profile", evidenceId: "synthetic-initial", initialConsent: true } as const;
const publicOp = (id: string, expectedRevision: number, requestedConsent: boolean) => ({ kind: "public_request", requestId: id, expectedRevision, requestedConsent });
const staffOp = (id: string, expectedRevision: number, pendingRequestId: string, decision: "granted" | "declined") => ({ kind: "verified_staff_decision", decisionId: id, expectedRevision, pendingRequestId, decision, actorId: "synthetic-active-staff" });
const done = (revision: number) => ({ status: "committed", revision });
const replay = (revision: number) => ({ status: "replayed", revision });
const denied = (reason: string) => ({ status: "rejected", reason });
async function fixture(run: (table: TableClient, name: string) => Promise<void>) {
  const name = "HopeConsent147" + randomUUID().replace(/-/g, "");
  const table = createIsolatedVisitorTestTable(name);
  await table.createTable();
  try { await run(table, name); } finally { await table.deleteTable(); }
}
function port(table: TableClient, submitTransaction: Port["submitTransaction"]): Port {
  return { getEntity: table.getEntity.bind(table), listEntities: table.listEntities.bind(table), submitTransaction };
}
async function state(table: TableClient, id = visitor) {
  const r = await repository(table).read(id);
  assert.equal(r.status, "ready");
  if (r.status !== "ready") throw new Error("Expected authority");
  return r.state;
}
async function rows(table: TableClient, partitionKey = pk) {
  const result: string[] = [];
  for await (const row of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${partitionKey}'` } })) result.push(row.rowKey!);
  return result.sort();
}

test("initial authority and immutable receipt persist together", async () => fixture(async table => {
  const repo = repository(table);
  assert.deepEqual(await repo.read(visitor), { status: "not_initialized" });
  assert.deepEqual(await repo.apply(visitor, init), done(1));
  assert.deepEqual(await rows(table), ["head", "op:synthetic-initial"]);
  assert.equal(permitsContactWork(await state(table)), true);
}));

test("initialization of an existing profile never grants permission", async () => fixture(async table => {
  assert.deepEqual(await repository(table).apply(visitor, { kind: "existing_profile", evidenceId: "synthetic-existing" }), done(1));
  assert.equal((await state(table)).effective, "unknown");
  assert.equal(permitsContactWork(await state(table)), false);
}));

test("exact operation replay survives a new repository instance", async () => fixture(async (table, name) => {
  assert.deepEqual(await repository(table).apply(visitor, init), done(1));
  const second = repository(createIsolatedVisitorTestTable(name));
  assert.deepEqual(await second.apply(visitor, init), replay(1));
  assert.equal((await rows(table)).length, 2);
}));

test("operation ID reuse with changed content is rejected", async () => fixture(async table => {
  const repo = repository(table);
  assert.deepEqual(await repo.apply(visitor, init), done(1));
  assert.deepEqual(await repo.apply(visitor, { ...init, initialConsent: false }), denied("conflict"));
  const op = publicOp("synthetic-withdraw", 1, false);
  assert.deepEqual(await repo.apply(visitor, op), done(2));
  assert.deepEqual(await repo.apply(visitor, { ...op, expectedRevision: 2 }), denied("conflict"));
  assert.equal((await rows(table)).length, 3);
}));

test("old grant replay never clears a subsequent withdrawal", async () => fixture(async table => {
  const repo = repository(table);
  await repo.apply(visitor, init);
  const yes = publicOp("synthetic-yes", 1, true);
  assert.deepEqual(await repo.apply(visitor, yes), done(2));
  assert.deepEqual(await repo.apply(visitor, publicOp("synthetic-no", 2, false)), done(3));
  assert.deepEqual(await repo.apply(visitor, yes), replay(2));
  assert.deepEqual(await repo.apply(visitor, init), replay(1));
  const current = await state(table);
  assert.equal(current.revision, 3);
  assert.equal(permitsContactWork(current), false);
}));

test("distinct withdrawal advances revision and replaces pending reference", async () => fixture(async table => {
  const repo = repository(table);
  await repo.apply(visitor, init);
  await repo.apply(visitor, publicOp("synthetic-no-1", 1, false));
  const oldDecision = staffOp("synthetic-old-decision", 2, "synthetic-no-1", "granted");
  assert.deepEqual(await repo.apply(visitor, publicOp("synthetic-no-2", 2, false)), done(3));
  assert.deepEqual(await repo.apply(visitor, oldDecision), denied("stale_revision"));
  assert.deepEqual(await repo.apply(visitor, { ...oldDecision, expectedRevision: 3 }), denied("transition_rejected"));
  assert.equal((await state(table)).pending?.requestId, "synthetic-no-2");
  assert.equal(permitsContactWork(await state(table)), false);
}));

test("only exact current pending reference accepts trusted decision classification", async () => fixture(async table => {
  const repo = repository(table);
  await repo.apply(visitor, { ...init, initialConsent: false });
  assert.deepEqual(await repo.apply(visitor, publicOp("synthetic-yes", 1, true)), done(2));
  assert.equal(permitsContactWork(await state(table)), false);
  const op = staffOp("synthetic-verified", 2, "synthetic-yes", "granted");
  assert.deepEqual(await repo.apply(visitor, op), done(3));
  assert.deepEqual(await repo.apply(visitor, op), replay(3));
  assert.equal(permitsContactWork(await state(table)), true);
}));

test("two independent clients racing on one ETag cannot both commit", async () => fixture(async (table, name) => {
  await repository(table).apply(visitor, init);
  const other = createIsolatedVisitorTestTable(name);
  let reached = 0;
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  function racing(client: TableClient): Port {
    return port(client, async actions => {
      if (++reached === 2) release();
      await barrier;
      return client.submitTransaction(actions);
    });
  }
  const results = await Promise.all([
    repository(racing(table)).apply(visitor, publicOp("synthetic-race-a", 1, false)),
    repository(racing(other)).apply(visitor, publicOp("synthetic-race-b", 1, false))
  ]);
  assert.equal(reached, 2);
  assert.equal(results.filter(r => r.status === "committed").length, 1);
  assert.equal(results.filter(r => r.status === "rejected" && r.reason === "stale_revision").length, 1);
  assert.equal((await state(table)).revision, 2);
  assert.equal((await rows(table)).length, 3);
}));

test("lost transaction acknowledgement resolves from durable receipt", async () => fixture(async table => {
  const unreliable = repository(port(table, async actions => {
    await table.submitTransaction(actions);
    throw new Error("Synthetic lost acknowledgement");
  }));
  assert.deepEqual(await unreliable.apply(visitor, init), replay(1));
  const op = publicOp("synthetic-no", 1, false);
  assert.deepEqual(await unreliable.apply(visitor, op), replay(2));
  assert.deepEqual(await repository(table).apply(visitor, op), replay(2));
  assert.equal(permitsContactWork(await state(table)), false);
}));

test("actual conflicting transaction rolls back authority and receipt", async () => fixture(async table => {
  const repo = repository(table);
  await repo.apply(visitor, init);
  await table.createEntity({ partitionKey: pk, rowKey: "synthetic-collision" });
  const failing = repository(port(table, async actions => {
    const conflict: TransactionAction = ["create", { partitionKey: pk, rowKey: "synthetic-collision" }];
    return table.submitTransaction([...actions, conflict]);
  }));
  const op = publicOp("synthetic-no", 1, false);
  assert.deepEqual(await failing.apply(visitor, op), denied("unavailable"));
  assert.equal((await state(table)).revision, 1);
  assert.deepEqual(await rows(table), ["head", "op:synthetic-initial", "synthetic-collision"]);
  assert.deepEqual(await repo.apply(visitor, op), done(2));
}));

test("malformed head fails closed", async () => fixture(async table => {
  const repo = repository(table);
  await repo.apply(visitor, init);
  await table.updateEntity({ partitionKey: pk, rowKey: "head", stateJson: "{}" }, "Merge");
  assert.deepEqual(await repo.read(visitor), { status: "unavailable" });
  assert.deepEqual(await repo.apply(visitor, publicOp("synthetic-no", 1, false)), denied("unavailable"));
}));

test("missing last receipt invalidates authority head", async () => fixture(async table => {
  const repo = repository(table);
  await repo.apply(visitor, init);
  await table.deleteEntity(pk, "op:synthetic-initial");
  assert.deepEqual(await repo.read(visitor), { status: "unavailable" });
  assert.deepEqual(await repo.apply(visitor, init), denied("unavailable"));
}));

test("orphan receipt prevents silent authority reinitialization", async () => fixture(async table => {
  const repo = repository(table);
  await repo.apply(visitor, init);
  await table.deleteEntity(pk, "head");
  assert.deepEqual(await repo.read(visitor), { status: "unavailable" });
  assert.deepEqual(await repo.apply(visitor, { ...init, evidenceId: "synthetic-other" }), denied("unavailable"));
  assert.deepEqual(await repo.apply(visitor, init), denied("unavailable"));
}));

test("independent visitor partitions cannot share authority", async () => fixture(async table => {
  const repo = repository(table);
  assert.deepEqual(await repo.apply(visitor, init), done(1));
  assert.deepEqual(await repo.apply("synthetic-other", { ...init, initialConsent: false }), done(1));
  assert.equal(permitsContactWork(await state(table)), true);
  assert.equal(permitsContactWork(await state(table, "synthetic-other")), false);
}));

test("invalid input and missing storage never authorize work", async () => {
  const table = createIsolatedVisitorTestTable("HopeConsentAbsent" + randomUUID().replace(/-/g, ""));
  const repo = repository(table);
  assert.deepEqual(await repo.apply("invalid/id", init), denied("invalid_command"));
  assert.deepEqual(await repo.apply(visitor, { ...init, actorId: "synthetic-unexpected" }), denied("invalid_command"));
  assert.deepEqual(await repo.read(visitor), { status: "unavailable" });
  assert.deepEqual(await repo.apply(visitor, init), denied("unavailable"));
});

test("historical verified grant persists with an immutable receipt and exact replay", async () =>
  fixture(async (table, name) => {
    const repo = repository(table, true);

    assert.deepEqual(await repo.apply(visitor, {
      kind: "existing_profile",
      evidenceId: "synthetic-historical-init"
    }), done(1));

    const operation = {
      kind: "verified_staff_decision",
      expectedRevision: 1,
      decisionId: "synthetic-historical-grant",
      pendingRequestId: null,
      actorId: "synthetic-authorized-admin",
      decision: "granted"
    };

    assert.deepEqual(
      await repo.apply(visitor, operation),
      done(2)
    );

    const restarted = repository(
      createIsolatedVisitorTestTable(name), true
    );

    assert.deepEqual(
      await restarted.apply(visitor, operation),
      replay(2)
    );

    const current = await restarted.read(visitor);

    assert.equal(current.status, "ready");

    if (current.status !== "ready") {
      throw Error("Expected durable authority");
    }

    assert.equal(permitsContactWork(current.state), true);

    assert.deepEqual(await rows(table, visitor), [
      "consent-v1:head",
      "consent-v1:op:synthetic-historical-grant",
      "consent-v1:op:synthetic-historical-init"
    ]);

    assert.deepEqual(await restarted.apply(visitor, {
      ...operation,
      decision: "declined"
    }), denied("conflict"));

    console.log("HISTORICAL_GRANT_RECEIPT_REPLAY_VERIFIED=True");
  })
);

test("historical verified decline remains denied and cannot be overwritten", async () =>
  fixture(async table => {
    const repo = repository(table, true);

    assert.deepEqual(await repo.apply(visitor, {
      kind: "existing_profile",
      evidenceId: "synthetic-historical-init"
    }), done(1));

    const operation = {
      kind: "verified_staff_decision",
      expectedRevision: 1,
      decisionId: "synthetic-historical-decline",
      pendingRequestId: null,
      actorId: "synthetic-authorized-admin",
      decision: "declined"
    };

    assert.deepEqual(
      await repo.apply(visitor, operation),
      done(2)
    );

    assert.deepEqual(await repo.apply(visitor, {
      ...operation,
      expectedRevision: 2,
      decisionId: "synthetic-forbidden-overwrite",
      decision: "granted"
    }), denied("transition_rejected"));

    const current = await repo.read(visitor);

    assert.equal(current.status, "ready");

    if (current.status !== "ready") {
      throw Error("Expected durable authority");
    }

    assert.equal(current.state.effective, "declined");
    assert.equal(permitsContactWork(current.state), false);

    console.log("HISTORICAL_DECLINE_PROTECTED=True");
  })
);

test("historical verification loses atomically to concurrent withdrawal", async () =>
  fixture(async table => {
    const repo = repository(table, true);

    assert.deepEqual(await repo.apply(visitor, {
      kind: "existing_profile",
      evidenceId: "synthetic-historical-init"
    }), done(1));

    let injected = false;

    const racing = repository(port(table, async actions => {
      assert.equal(injected, false);
      injected = true;

      assert.deepEqual(await repo.apply(
        visitor,
        publicOp("synthetic-concurrent-withdrawal", 1, false)
      ), done(2));

      return table.submitTransaction(actions);
    }), true);

    assert.deepEqual(await racing.apply(visitor, {
      kind: "verified_staff_decision",
      expectedRevision: 1,
      decisionId: "synthetic-racing-grant",
      pendingRequestId: null,
      actorId: "synthetic-authorized-admin",
      decision: "granted"
    }), denied("stale_revision"));

    assert.equal(injected, true);

    const current = await repo.read(visitor);

    assert.equal(current.status, "ready");

    if (current.status !== "ready") {
      throw Error("Expected durable authority");
    }

    assert.equal(current.state.pending?.kind, "withdrawal");
    assert.equal(permitsContactWork(current.state), false);

    assert.equal(
      (await rows(table, visitor)).includes(
        "consent-v1:op:synthetic-racing-grant"
      ),
      false
    );

    console.log("CONCURRENT_WITHDRAWAL_ATOMICALLY_PROTECTED=True");
  })
);
