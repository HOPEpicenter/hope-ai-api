import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  EXECUTION_CONFIRMATION,
  resolveVisitorId,
  buildTableDefinitions,
  resolveExecutionMode,
} = require("../scripts/cleanupTestData.js");

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

// Default behavior (no --execute flag) must remain non-destructive.
const defaultMode = resolveExecutionMode(["node", "cleanupTestData.js"], null);
assert.equal(defaultMode.execute, false);
assert.equal(defaultMode.mode, "audit");

// Destructive mode requires the exact confirmation phrase.
assert.throws(
  () => resolveExecutionMode(["node", "cleanupTestData.js", "--execute"], "wrong-phrase"),
  /Destructive execution requires --confirm=DELETE-STAGING-TEST-DATA/,
);

const confirmedMode = resolveExecutionMode(
  ["node", "cleanupTestData.js", "--execute", "--confirm=DELETE-STAGING-TEST-DATA"],
  "DELETE-STAGING-TEST-DATA",
);
assert.equal(confirmedMode.execute, true);
assert.equal(confirmedMode.mode, "execute");

console.log("cleanupTestDataScope.test.mjs passed");
