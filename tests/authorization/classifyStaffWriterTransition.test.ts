import assert from "node:assert/strict";
import {
  classifyStaffWriterTransition,
  type StaffWriterMutationCategory
} from "../../src/domain/staff/classifyStaffWriterTransition";

const categories: StaffWriterMutationCategory[] = [
  "identity_creation",
  "identity_update",
  "identity_deactivation",
  "invitation_activation"
];

let passed = 0;

function checkNoAuthority(
  value: ReturnType<typeof classifyStaffWriterTransition>
): void {
  assert.equal(value.authorizationGranted, false);
  assert.equal(value.coordinatedExecutionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.recoveryPermitted, false);
  assert.equal(value.reservationReleasePermitted, false);
  assert.equal(value.productionWriterFenced, false);
}

function verify(name: string, test: () => void): void {
  test();
  passed++;
  console.log(`[PASS] ${name}`);
}

for (const category of categories) {
  verify(`${category}: default legacy compatibility`, () => {
    const result = classifyStaffWriterTransition({ category });
    assert.equal(result.status, "legacy_candidate");
    assert.equal(result.reason, "legacy_mode");
    assert.equal(result.legacyAppendEligible, true);
    checkNoAuthority(result);
  });

  verify(`${category}: explicit migration hold`, () => {
    const result = classifyStaffWriterTransition({
      category,
      mode: "migration_hold"
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "migration_hold");
    assert.equal(result.legacyAppendEligible, false);
    checkNoAuthority(result);
  });

  verify(`${category}: coordinated path requires separate writer`, () => {
    const result = classifyStaffWriterTransition({
      category,
      mode: "coordinated"
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "coordinator_required");
    assert.equal(result.legacyAppendEligible, false);
    checkNoAuthority(result);
  });
}

verify("Unknown category rejected", () => {
  const result = classifyStaffWriterTransition({
    category: "identity_delete"
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.legacyAppendEligible, false);
  checkNoAuthority(result);
});

verify("Unknown mode rejected", () => {
  const result = classifyStaffWriterTransition({
    category: "identity_creation",
    mode: "force"
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.legacyAppendEligible, false);
  checkNoAuthority(result);
});

verify("Null mode rejected", () => {
  const result = classifyStaffWriterTransition({
    category: "identity_creation",
    mode: null
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.legacyAppendEligible, false);
  checkNoAuthority(result);
});

verify("Forged production fence rejected", () => {
  const result = classifyStaffWriterTransition({
    category: "identity_creation",
    mode: "legacy",
    productionWriterFenced: true
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.legacyAppendEligible, false);
  checkNoAuthority(result);
});

verify("Malformed fence claim rejected", () => {
  const result = classifyStaffWriterTransition({
    category: "identity_update",
    productionWriterFenced: "false"
  });
  assert.equal(result.status, "invalid");
  assert.equal(result.legacyAppendEligible, false);
  checkNoAuthority(result);
});

verify("Missing input rejected", () => {
  const result = classifyStaffWriterTransition(null);
  assert.equal(result.status, "invalid");
  assert.equal(result.legacyAppendEligible, false);
  checkNoAuthority(result);
});

verify("Array input rejected", () => {
  const result = classifyStaffWriterTransition([]);
  assert.equal(result.status, "invalid");
  assert.equal(result.legacyAppendEligible, false);
  checkNoAuthority(result);
});

verify("Explicit legacy mode never grants authority", () => {
  const result = classifyStaffWriterTransition({
    category: "identity_creation",
    mode: "legacy"
  });
  assert.equal(result.status, "legacy_candidate");
  assert.equal(result.legacyAppendEligible, true);
  checkNoAuthority(result);
});

assert.equal(passed, 20);
console.log(`[PASS] All ${passed} Staff transition regressions`);