import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  createSyntheticCleanupFixture,
  inspectSyntheticIntakeFixture
} from "./simulate-synthetic-intake-cleanup.mjs";

const require = createRequire(import.meta.url);
require("ts-node/register");
const { appendKioskIntakeSubmissionV1 } = require(
  "../../src/repositories/kioskIntakeSubmissionsRepositoryV1.ts"
);
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const target = {
  subscription: "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
  resourceGroup: "rg-hope-kiosk-acceptance-20261122",
  account: "sthopekiad20261122",
  table: "KioskIntakeSubmissions",
  partition: "friends-family-2026-11-22",
  submissionId: id
};
const payload = {
  name: "Synthetic Kiosk Cleanup Test",
  email: "kiosk-cleanup@example.invalid",
  phone: "",
  visitType: "first",
  interests: ["prayer"],
  invitedBy: "",
  contactConsent: false
};

async function setup() {
  let row;
  const table = {
    async createEntity(entity) { row = structuredClone(entity); },
    async getEntity() { throw new Error("UNEXPECTED_READ"); }
  };
  const result = await appendKioskIntakeSubmissionV1(payload, id, {
    enabled: true,
    table,
    now: () => "2026-11-22T15:00:00.000Z"
  });
  assert.equal(result.status, "recorded");
  row.etag = 'W/"synthetic-etag"';
  const fixture = createSyntheticCleanupFixture(row);
  const capture = fixture.captureSyntheticSubmission(id);
  const inspect = (overrides = {}) => inspectSyntheticIntakeFixture(
    overrides.target ?? target,
    {
      store: overrides.store ?? fixture.store,
      capture: overrides.capture ?? capture,
      enabled: overrides.enabled ?? true,
      ...overrides.options
    }
  );
  return { fixture, capture, inspect, row };
}

test("inspection defaults off and claimed approvals cannot invoke an unbranded client", async () => {
  const { fixture, capture } = await setup();
  assert.deepEqual(await inspectSyntheticIntakeFixture(target, {
    store: fixture.store, capture, approved: true, mode: "inspect"
  }), { status: "DISABLED" });
  let reads = 0;
  const untrusted = { async getEntity() { reads++; throw new Error("must not be called"); } };
  for (const options of [
    { store: untrusted, capture: {}, approved: true },
    { store: untrusted, capture, enabled: true, approved: true },
    { store: untrusted, capture, enabled: true, authorization: { verified: true } }
  ]) {
    const result = await inspectSyntheticIntakeFixture(target, options);
    assert.ok(["DISABLED", "FIXTURE_REQUIRED"].includes(result.status));
    assert.deepEqual(Object.keys(result), ["status"]);
  }
  assert.equal(reads, 0);
  assert.deepEqual(fixture.counts(), { reads: 0, deletions: 0 });
});

test("one exact synthetic fixture row yields a status-only read without mutations", async () => {
  const { fixture, capture, inspect } = await setup();
  assert.deepEqual(await inspect(), { status: "MATCHED_READ_ONLY" });
  const approval = fixture.approveSimulation(target, capture, 'W/"synthetic-etag"');
  assert.deepEqual(await inspect({
    options: { mode: "simulate-delete", approval }
  }), { status: "MATCHED_READ_ONLY" });
  assert.deepEqual(fixture.counts(), { reads: 2, deletions: 0 });
});

test("wrong scope, UUID or fixture capture denies before any read", async () => {
  const { fixture, inspect } = await setup();
  for (const change of [
    { subscription: "wrong" }, { resourceGroup: "wrong" },
    { account: "wrong" }, { table: "wrong" }, { partition: "wrong" },
    { submissionId: "invalid" }, { submissionId: id.toUpperCase() },
    { extra: true }
  ]) {
    assert.deepEqual(await inspect({ target: { ...target, ...change } }), {
      status: "INVALID_TARGET"
    });
  }
  assert.deepEqual(await inspect({
    target: Object.assign(Object.create(target), {
      extra1: true, extra2: true, extra3: true,
      extra4: true, extra5: true, extra6: true
    })
  }), { status: "INVALID_TARGET" });
  assert.deepEqual(await inspect({ target: { ...target, submissionId: otherId } }), {
    status: "SYNTHETIC_PROOF_REQUIRED"
  });
  assert.deepEqual(await inspect({ capture: {} }), { status: "SYNTHETIC_PROOF_REQUIRED" });
  assert.deepEqual(fixture.counts(), { reads: 0, deletions: 0 });
});

test("missing records and storage errors fail closed without leaking error data", async () => {
  const { fixture, inspect } = await setup();
  fixture.replaceRow(null);
  assert.deepEqual(await inspect(), { status: "ROW_NOT_FOUND" });
  fixture.failNextRead(404);
  assert.deepEqual(await inspect(), { status: "ROW_NOT_FOUND" });
  for (const status of [403, 429, 500, "unknown"]) {
    fixture.failNextRead(status);
    assert.deepEqual(await inspect(), { status: "READ_FAILED" });
  }
  assert.equal(fixture.counts().reads, 6);
  assert.equal(fixture.counts().deletions, 0);
});

test("changed or claimed rows and invalid ETags are rejected", async () => {
  const { fixture, inspect, row } = await setup();
  for (const change of [
    { partitionKey: "wrong" }, { rowKey: otherId },
    { payloadHash: "0".repeat(64) }, { name: "other" },
    { email: "other@example.invalid" }, { phone: "1" },
    { visitType: "returning" }, { interestsJson: "[]" },
    { invitedBy: "other" }, { contactConsent: true },
    { source: "other" }, { reviewStatus: "importing" },
    { reviewStatus: "imported" }, { canonicalVisitorId: "claim" },
    { claimId: "claim" }, { unexpected: true },
    { receivedAt: "invalid" }, { etag: "*" }, { etag: " * " },
    { etag: "" }, { etag: "not-an-etag" }, { etag: 'W/"synthetic"\n' }
  ]) {
    fixture.replaceRow({ ...row, ...change });
    const result = await inspect();
    assert.ok(["ROW_REJECTED", "ROW_NOT_FOUND"].includes(result.status));
    assert.deepEqual(Object.keys(result), ["status"]);
  }
  for (const key of Object.keys(row)) {
    const omitted = { ...row };
    delete omitted[key];
    fixture.replaceRow(omitted);
    assert.ok(["ROW_REJECTED", "ROW_NOT_FOUND"].includes((await inspect()).status));
  }
  assert.equal(fixture.counts().deletions, 0);
});
