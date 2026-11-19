import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  createSyntheticCleanupFixture,
  simulateSyntheticIntakeCleanup
} from "./simulate-synthetic-intake-cleanup.mjs";

const require = createRequire(import.meta.url);
require("ts-node/register");
const { appendKioskIntakeSubmissionV1 } = require(
  "../../src/repositories/kioskIntakeSubmissionsRepositoryV1.ts"
);
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const target = Object.freeze({
  subscription: "fbafd6e4-21ad-41d9-8f98-091c3c73ded2",
  resourceGroup: "rg-hope-kiosk-acceptance-20261122",
  account: "sthopekiad20261122",
  table: "KioskIntakeSubmissions",
  partition: "friends-family-2026-11-22",
  submissionId: id
});
const synthetic = {
  name: "Synthetic Kiosk Cleanup Test",
  email: "kiosk-cleanup@example.invalid",
  phone: "",
  visitType: "first",
  interests: ["prayer"],
  invitedBy: "",
  contactConsent: false
};

async function setup() {
  let saved;
  const table = {
    async createEntity(entity) { saved = structuredClone(entity); },
    async getEntity() { throw new Error("UNEXPECTED_READ"); }
  };
  const receipt = await appendKioskIntakeSubmissionV1(synthetic, id, {
    enabled: true,
    table,
    now: () => "2026-11-22T15:00:00.000Z"
  });
  assert.equal(receipt.status, "recorded");
  saved.etag = 'W/"synthetic-1"';
  const fixture = createSyntheticCleanupFixture(saved);
  const capture = fixture.captureSyntheticSubmission(id);
  return { fixture, capture, row: saved };
}

async function run(fixture, capture, overrides = {}) {
  return simulateSyntheticIntakeCleanup(
    overrides.target ?? target,
    {
      store: overrides.store ?? fixture.store,
      capture: overrides.capture ?? capture,
      mode: overrides.mode ?? "inspect",
      approval: overrides.approval
    }
  );
}

test("disabled by default and inspection never delete", async () => {
  const { fixture, capture } = await setup();
  assert.equal(
    (await simulateSyntheticIntakeCleanup(target, {
      store: fixture.store, capture
    })).status,
    "DISABLED"
  );
  assert.deepEqual(fixture.counts(), { reads: 0, deletions: 0 });
  const approval = fixture.approveSimulation(target, capture, 'W/"synthetic-1"');
  const inspected = await run(fixture, capture, { approval });
  assert.equal(inspected.status, "MATCHED_READ_ONLY");
  assert.equal(inspected.liveExecutionPermitted, false);
  assert.deepEqual(fixture.counts(), { reads: 1, deletions: 0 });
});

test("rejects every wrong target before storage access", async () => {
  const { fixture, capture } = await setup();
  for (const bad of [
    { subscription: "wrong" }, { resourceGroup: "wrong" },
    { account: "wrong" }, { table: "wrong" }, { partition: "wrong" },
    { submissionId: "not-a-uuid" }, { submissionId: id.toUpperCase() },
    { unexpected: "extra" }
  ]) {
    const outcome = await run(fixture, capture, { target: { ...target, ...bad } });
    assert.equal(outcome.status, "INVALID_TARGET");
  }
  assert.deepEqual(fixture.counts(), { reads: 0, deletions: 0 });
});

test("requires proof binding the exact submission ID", async () => {
  const { fixture, capture } = await setup();
  assert.equal((await run(fixture, capture, {
    target: { ...target, submissionId: otherId }
  })).status, "SYNTHETIC_PROOF_REQUIRED");
  assert.equal((await run(fixture, capture, {
    capture: {}
  })).status, "SYNTHETIC_PROOF_REQUIRED");
  assert.deepEqual(fixture.counts(), { reads: 0, deletions: 0 });
});

test("only branded in-memory fixtures can be used", async () => {
  const { fixture, capture } = await setup();
  let called = false;
  const untrusted = { async getEntity() { called = true; } };
  assert.equal((await run(fixture, capture, {
    store: untrusted
  })).status, "FIXTURE_REQUIRED");
  assert.equal(called, false);
});

test("missing row is denied without deletion", async () => {
  const { fixture, capture } = await setup();
  fixture.replaceRow(null);
  assert.equal((await run(fixture, capture)).status, "ROW_NOT_FOUND");
  assert.equal(fixture.counts().deletions, 0);
});

test("rejects changed fingerprint, identity, source and claim state", async () => {
  const { fixture, capture, row } = await setup();
  for (const change of [
    { payloadHash: "0".repeat(64) },
    { name: "not the synthetic identity" },
    { email: "other@example.invalid" },
    { source: "other" },
    { reviewStatus: "importing" },
    { reviewStatus: "imported" },
    { canonicalVisitorId: "synthetic-claim" },
    { claimId: "synthetic-claim" },
    { etag: "*" },
    { etag: "" }
  ]) {
    fixture.replaceRow({ ...row, ...change });
    assert.equal((await run(fixture, capture)).status, "ROW_REJECTED");
  }
  assert.equal(fixture.counts().deletions, 0);
});

test("simulation requires operation-specific approval, not a mode alone", async () => {
  const { fixture, capture } = await setup();
  const result = await run(fixture, capture, {
    mode: "simulate-delete",
    approval: {}
  });
  assert.equal(result.status, "APPROVAL_REQUIRED");
  assert.equal(result.liveExecutionPermitted, false);
  assert.deepEqual(fixture.counts(), { reads: 0, deletions: 0 });
});

test("an approval bound to a different capture or row is rejected", async () => {
  const { fixture, capture } = await setup();
  const otherCapture = fixture.captureSyntheticSubmission(otherId);
  const approval = fixture.approveSimulation(
    { ...target, submissionId: otherId }, otherCapture, 'W/"synthetic-1"'
  );
  assert.equal((await run(fixture, capture, {
    mode: "simulate-delete", approval
  })).status, "APPROVAL_REQUIRED");
  assert.equal(fixture.counts().deletions, 0);
});

test("changed ETag after approval is rejected", async () => {
  const { fixture, capture, row } = await setup();
  const approval = fixture.approveSimulation(target, capture, row.etag);
  fixture.replaceRow({ ...row, etag: 'W/"synthetic-2"' });
  assert.equal((await run(fixture, capture, {
    mode: "simulate-delete", approval
  })).status, "ETAG_CHANGED");
  assert.equal(fixture.counts().deletions, 0);
});

test("conditional deletion detects a concurrent reconciliation claim", async () => {
  const { fixture, capture, row } = await setup();
  const approval = fixture.approveSimulation(target, capture, row.etag);
  fixture.changeBeforeDelete(current => ({
    ...current, reviewStatus: "importing", etag: 'W/"synthetic-2"'
  }));
  assert.equal((await run(fixture, capture, {
    mode: "simulate-delete", approval
  })).status, "CONCURRENT_CHANGE");
  assert.equal(fixture.counts().deletions, 0);
});

test("approved fixture-only conditional deletion is single-use", async () => {
  const { fixture, capture, row } = await setup();
  const approval = fixture.approveSimulation(target, capture, row.etag);
  const deleted = await run(fixture, capture, {
    mode: "simulate-delete", approval
  });
  assert.equal(deleted.status, "SIMULATED_DELETION");
  assert.equal(deleted.liveExecutionPermitted, false);
  assert.equal(fixture.counts().deletions, 1);
  assert.equal((await run(fixture, capture, {
    mode: "simulate-delete", approval
  })).status, "APPROVAL_REQUIRED");
});
