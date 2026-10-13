import assert from "node:assert/strict";
import {
  STAFF_WRITER_MIGRATION_GATES,
  assessStaffWriterMigrationReadiness,
  type StaffWriterMigrationEvidence,
  type StaffWriterMigrationAssessment
} from "../../src/domain/staff/staffWriterMigrationReadiness";

function complete(): StaffWriterMigrationEvidence {
  return Object.fromEntries(
    STAFF_WRITER_MIGRATION_GATES.map(gate => [gate, "verified"])
  ) as StaffWriterMigrationEvidence;
}

function assertNonAuthorizing(a: StaffWriterMigrationAssessment): void {
  assert.equal(a.advisoryOnly, true);
  assert.equal(a.authoritative, false);
  assert.equal(a.enforcementPermitted, false);
  assert.equal(a.executionPermitted, false);
  assert.equal(a.retryPermitted, false);
  assert.equal(a.automaticRecoveryPermitted, false);
  assert.equal(a.productionRolloutPermitted, false);
}

// A complete collection of claims is advisory, never authorization.
{
  const a = assessStaffWriterMigrationReadiness(complete());

  assert.equal(a.status, "eligible_for_architecture_review");
  assert.equal(a.inputRejected, false);
  assert.deepEqual(a.missingOrFailedGates, []);
  assert.ok(a.diagnostics.includes("review_eligible_not_authorized"));
  assertNonAuthorizing(a);
}

// Every missing migration guarantee blocks readiness independently.
for (const gate of STAFF_WRITER_MIGRATION_GATES) {
  for (const state of ["unverified", "failed"] as const) {
    const evidence = { ...complete(), [gate]: state };
    const a = assessStaffWriterMigrationReadiness(evidence);

    assert.equal(a.status, "not_ready", gate);
    assert.equal(a.inputRejected, false);
    assert.deepEqual(a.missingOrFailedGates, [gate]);
    assert.ok(a.diagnostics.includes(`gate:${gate}:${state}`));
    assertNonAuthorizing(a);
  }
}

// Specifically: a legacy bypass cannot be considered ready.
{
  const a = assessStaffWriterMigrationReadiness({
    ...complete(),
    legacy_writers_fenced: "failed"
  });

  assert.equal(a.status, "not_ready");
  assert.deepEqual(a.missingOrFailedGates, ["legacy_writers_fenced"]);
  assertNonAuthorizing(a);
}

// Multiple failures retain canonical order.
{
  const a = assessStaffWriterMigrationReadiness({
    ...complete(),
    staff_audit_compatible: "unverified",
    legacy_writers_fenced: "failed",
    binding_uniqueness_verified: "failed"
  });

  assert.deepEqual(a.missingOrFailedGates, [
    "legacy_writers_fenced",
    "staff_audit_compatible",
    "binding_uniqueness_verified"
  ]);
  assertNonAuthorizing(a);
}

// Missing, unexpected or incorrectly typed evidence fails closed.
const malformed: unknown[] = [
  null,
  undefined,
  true,
  7,
  "verified",
  [],
  {},
  { ...complete(), extra: "verified" },
  { ...complete(), legacy_writers_fenced: true },
  { ...complete(), legacy_writers_fenced: "ready" }
];

for (const evidence of malformed) {
  const a = assessStaffWriterMigrationReadiness(evidence);
  assert.equal(a.status, "not_ready");
  assert.equal(a.inputRejected, true);
  assert.deepEqual(
    a.missingOrFailedGates,
    [...STAFF_WRITER_MIGRATION_GATES]
  );
  assertNonAuthorizing(a);
}

// Getters must not execute when evidence is inspected.
{
  let called = false;
  const evidence = { ...complete() };

  Object.defineProperty(evidence, "legacy_writers_fenced", {
    enumerable: true,
    configurable: true,
    get() {
      called = true;
      throw new Error("sensitive_value");
    }
  });

  const a = assessStaffWriterMigrationReadiness(evidence);
  assert.equal(called, false);
  assert.equal(a.inputRejected, true);
  assert.equal(a.status, "not_ready");
  assertNonAuthorizing(a);
}

// Inherited claims and missing own keys cannot satisfy a gate.
{
  const evidence = Object.create(complete()) as Record<string, unknown>;

  const a = assessStaffWriterMigrationReadiness(evidence);
  assert.equal(a.inputRejected, true);
  assert.equal(a.status, "not_ready");
  assertNonAuthorizing(a);
}

// Revoked proxies and hostile reflection fail closed.
{
  const revoked = Proxy.revocable(complete(), {});
  revoked.revoke();

  const hostile = new Proxy(complete(), {
    ownKeys() {
      throw new Error("sensitive_value");
    }
  });

  for (const evidence of [revoked.proxy, hostile]) {
    const a = assessStaffWriterMigrationReadiness(evidence);
    assert.equal(a.status, "not_ready");
    assert.equal(a.inputRejected, true);
    assertNonAuthorizing(a);
    assert.ok(!JSON.stringify(a.diagnostics).includes("sensitive_value"));
  }
}

console.log("Staff writer migration readiness tests passed");
