import assert from "node:assert/strict";
import {
  classifyStaffWriterRuntimeEnforcement,
  readStaffWriterRuntimeEnforcement
} from "../../src/config/staffWriterRuntimeEnforcement";

let passed = 0;

function check(
  name: string,
  value: unknown,
  expectedMode: string,
  allowed: boolean
): void {
  const result = classifyStaffWriterRuntimeEnforcement(value);

  assert.equal(result.mode, expectedMode);
  assert.equal(result.allowLegacyWriter, allowed);
  assert.equal(result.blockInvitationBeforeGraph, !allowed);
  assert.equal(result.coordinatedExecutionPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.productionWriterFenced, false);

  passed++;
  console.log(`[PASS] ${name}`);
}

check("Undefined preserves legacy default", undefined, "legacy", true);
check("Explicit legacy remains compatible", "legacy", "legacy", true);
check("Migration hold denies legacy", "migration_hold", "migration_hold", false);
check("Coordinated mode denies fallback", "coordinated", "coordinated", false);
check("Unknown mode fails closed", "force", "invalid", false);
check("Empty string fails closed", "", "invalid", false);
check("Whitespace fails closed", " ", "invalid", false);
check("Null fails closed", null, "invalid", false);
check("Boolean true fails closed", true, "invalid", false);
check("Boolean false fails closed", false, "invalid", false);
check("Numeric mode fails closed", 1, "invalid", false);
check("Object mode fails closed", {}, "invalid", false);
check("Array mode fails closed", [], "invalid", false);
check("Uppercase bypass rejected", "LEGACY", "invalid", false);
check("Padded legacy bypass rejected", " legacy ", "invalid", false);

const original = process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;

try {
  delete process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;

  assert.equal(
    readStaffWriterRuntimeEnforcement().mode,
    "legacy"
  );
  passed++;
  console.log("[PASS] Absent runtime setting preserves legacy");

  process.env.HOPE_STAFF_WRITER_TRANSITION_MODE =
    "migration_hold";

  assert.equal(
    readStaffWriterRuntimeEnforcement().allowLegacyWriter,
    false
  );
  passed++;
  console.log("[PASS] Runtime migration hold blocks legacy");

  process.env.HOPE_STAFF_WRITER_TRANSITION_MODE =
    "coordinated";

  assert.equal(
    readStaffWriterRuntimeEnforcement().blockInvitationBeforeGraph,
    true
  );
  passed++;
  console.log("[PASS] Runtime coordinated mode blocks Graph");

  process.env.HOPE_STAFF_WRITER_TRANSITION_MODE =
    "unexpected";

  assert.equal(
    readStaffWriterRuntimeEnforcement().mode,
    "invalid"
  );
  passed++;
  console.log("[PASS] Malformed runtime setting fails closed");
} finally {
  if (original === undefined) {
    delete process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;
  } else {
    process.env.HOPE_STAFF_WRITER_TRANSITION_MODE = original;
  }
}

assert.equal(passed, 19);
console.log("[PASS] All 19 runtime enforcement regressions");