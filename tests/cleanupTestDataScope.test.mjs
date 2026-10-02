import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  EXECUTION_CONFIRMATION,
  resolveVisitorId,
  resolveDeletionDecision,
  buildTableDefinitions,
  resolveExecutionMode,
  parseTargetIds,
  assertNoProtectedTargetOverlap,
} = require("../scripts/cleanupTestData.js");

function withEnv(values, fn) {
  const previous = {};

  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

// Table definitions must cover every known visitor-linked table, including the two newly added ones.
const definitions = buildTableDefinitions();
const tableNames = definitions.map((definition) => definition.name);

for (const expectedTable of [
  "Visitors",
  "devFormationEvents",
  "devFormationProfiles",
  "EngagementEvents",
  "devEngagementSummaries",
  "devGlobalTimeline",
  "VisitorFollowupEvents",
  "MinistryCommunicationEvents",
]) {
  assert.ok(
    tableNames.includes(expectedTable),
    `expected table definitions to include "${expectedTable}"`,
  );
}

// StaffEvents must never be added to the destructive table definitions.
assert.ok(
  !tableNames.includes("StaffEvents"),
  "StaffEvents must not be part of the destructive table definitions",
);

const followupDefinition = definitions.find((definition) => definition.name === "VisitorFollowupEvents");
const communicationDefinition = definitions.find((definition) => definition.name === "MinistryCommunicationEvents");

assert.equal(followupDefinition.mode, "visitor-events");
assert.equal(communicationDefinition.mode, "visitor-events");

// Visitor ID resolution for the shared "visitor-events" mode.
assert.equal(
  resolveVisitorId("visitor-events", { visitorId: "visitor-123", partitionKey: "visitor-123" }),
  "visitor-123",
  "explicit visitorId should win",
);

assert.equal(
  resolveVisitorId("visitor-events", { partitionKey: "visitor-456" }),
  "visitor-456",
  "partitionKey should be used as a fallback when visitorId is missing",
);

assert.equal(
  resolveVisitorId("visitor-events", {}),
  "",
  "a blank/unresolvable row must not return a visitor ID",
);

assert.equal(
  resolveVisitorId("visitor-events", { visitorId: "   ", partitionKey: "" }),
  "",
  "whitespace-only fields must not resolve to a visitor ID",
);

// Execution confirmation must remain exact.
assert.equal(EXECUTION_CONFIRMATION, "DELETE-STAGING-TEST-DATA");

// (O) Default behavior (no --execute flag) must remain non-destructive, with no TARGET_IDS required.
const defaultMode = resolveExecutionMode(["node", "cleanupTestData.js"], null);
assert.equal(defaultMode.execute, false);
assert.equal(defaultMode.mode, "audit");

// (A) Valid TARGET_IDS JSON array parses correctly, (B) duplicates deduplicate, (C) blanks are ignored.
withEnv({ TARGET_IDS: '["visitor-1", "visitor-2", "visitor-1", "  ", ""]' }, () => {
  const targetIds = parseTargetIds();
  assert.deepEqual([...targetIds].sort(), ["visitor-1", "visitor-2"]);
});

// (D) Malformed TARGET_IDS JSON throws, mentioning TARGET_IDS.
withEnv({ TARGET_IDS: "{not json" }, () => {
  assert.throws(() => parseTargetIds(), /TARGET_IDS/);
});

// (E) Non-array TARGET_IDS throws, mentioning TARGET_IDS.
withEnv({ TARGET_IDS: '{"visitorId": "visitor-1"}' }, () => {
  assert.throws(() => parseTargetIds(), /TARGET_IDS/);
});

// (F) Target visitor becomes a deletion candidate.
const targetedDecision = resolveDeletionDecision({
  mode: "visitor-events",
  entity: { visitorId: "visitor-1", partitionKey: "visitor-1", rowKey: "row-1" },
  keepIds: new Set(),
  targetIds: new Set(["visitor-1"]),
});
assert.equal(targetedDecision.candidate, true);
assert.equal(targetedDecision.visitorId, "visitor-1");

// (G) Non-target visitor is retained even when it is not in KEEP_IDS.
const nonTargetedDecision = resolveDeletionDecision({
  mode: "visitor-events",
  entity: { visitorId: "visitor-2", partitionKey: "visitor-2", rowKey: "row-1" },
  keepIds: new Set(),
  targetIds: new Set(["visitor-1"]),
});
assert.equal(nonTargetedDecision.candidate, false);
assert.equal(nonTargetedDecision.reason, "not-targeted");

// (H) KEEP_IDS protects an ID even when it is also targeted.
const keptOverTargetedDecision = resolveDeletionDecision({
  mode: "visitor-events",
  entity: { visitorId: "visitor-1", partitionKey: "visitor-1", rowKey: "row-1" },
  keepIds: new Set(["visitor-1"]),
  targetIds: new Set(["visitor-1"]),
});
assert.equal(keptOverTargetedDecision.candidate, false);
assert.equal(keptOverTargetedDecision.reason, "kept");

// A row without a resolvable visitor ID must remain retained, regardless of targeting.
const noVisitorIdDecision = resolveDeletionDecision({
  mode: "visitor-events",
  entity: {},
  keepIds: new Set(),
  targetIds: new Set(["visitor-1"]),
});
assert.equal(noVisitorIdDecision.candidate, false);
assert.equal(noVisitorIdDecision.reason, "no-visitor-id");

// Audit mode without TARGET_IDS preserves the existing broad audit behavior.
const broadAuditDecision = resolveDeletionDecision({
  mode: "visitor-events",
  entity: { visitorId: "visitor-9", partitionKey: "visitor-9", rowKey: "row-1" },
  keepIds: new Set(),
  targetIds: new Set(),
});
assert.equal(broadAuditDecision.candidate, true);

// (I) Overlapping KEEP_IDS/TARGET_IDS must fail closed before any scanning.
assert.throws(
  () => assertNoProtectedTargetOverlap(new Set(["visitor-1"]), new Set(["visitor-1", "visitor-2"])),
  /TARGET_IDS overlaps with KEEP_IDS.*visitor-1/,
);

// No overlap must not throw.
assert.doesNotThrow(() =>
  assertNoProtectedTargetOverlap(new Set(["visitor-1"]), new Set(["visitor-2"])),
);

// (J) --execute with missing TARGET_IDS fails closed.
assert.throws(
  () => resolveExecutionMode(["node", "cleanupTestData.js", "--execute"], "DELETE-STAGING-TEST-DATA", new Set()),
  /TARGET_IDS/,
);

// (K) --execute with TARGET_IDS = [] fails closed.
assert.throws(
  () =>
    resolveExecutionMode(
      ["node", "cleanupTestData.js", "--execute"],
      "DELETE-STAGING-TEST-DATA",
      withEnv({ TARGET_IDS: "[]" }, () => parseTargetIds()),
    ),
  /TARGET_IDS/,
);

// (L) --execute with only blank TARGET_IDS entries fails closed.
assert.throws(
  () =>
    resolveExecutionMode(
      ["node", "cleanupTestData.js", "--execute"],
      "DELETE-STAGING-TEST-DATA",
      withEnv({ TARGET_IDS: '["  ", ""]' }, () => parseTargetIds()),
    ),
  /TARGET_IDS/,
);

// (M) --execute with explicit non-empty TARGET_IDS but the wrong confirmation fails.
assert.throws(
  () =>
    resolveExecutionMode(
      ["node", "cleanupTestData.js", "--execute"],
      "wrong-phrase",
      new Set(["visitor-1"]),
    ),
  /Destructive execution requires --confirm=DELETE-STAGING-TEST-DATA/,
);

// (N) --execute with explicit TARGET_IDS and the exact confirmation succeeds at this level.
const confirmedMode = resolveExecutionMode(
  ["node", "cleanupTestData.js", "--execute", "--confirm=DELETE-STAGING-TEST-DATA"],
  "DELETE-STAGING-TEST-DATA",
  new Set(["visitor-1"]),
);
assert.equal(confirmedMode.execute, true);
assert.equal(confirmedMode.mode, "execute");

console.log("cleanupTestDataScope.test.mjs passed");
