import assert from "node:assert/strict";
import {
  CARE_BULK_WRITER_MIGRATION_GATES,
  assessCareBulkWriterMigrationReadiness,
  type CareBulkWriterMigrationAssessment,
  type CareBulkWriterMigrationEvidence
} from "../../src/services/authorization/careBulkWriterMigrationReadiness";

function complete(): CareBulkWriterMigrationEvidence {
  return Object.fromEntries(
    CARE_BULK_WRITER_MIGRATION_GATES.map(gate => [gate, "verified"])
  ) as CareBulkWriterMigrationEvidence;
}

function safe(value: CareBulkWriterMigrationAssessment): void {
  assert.equal(value.advisoryOnly, true);
  assert.equal(value.authoritative, false);
  assert.equal(value.writerParticipationVerified, false);
  assert.equal(value.historicalCompletenessVerified, false);
  assert.equal(value.authorizationPermitted, false);
  assert.equal(value.enforcementPermitted, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.automaticRecoveryPermitted, false);
  assert.equal(value.productionRolloutPermitted, false);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.missingOrFailedGates), true);
  assert.equal(Object.isFrozen(value.diagnostics), true);
}

assert.equal(CARE_BULK_WRITER_MIGRATION_GATES.length, 10);
assert.equal(
  new Set(CARE_BULK_WRITER_MIGRATION_GATES).size,
  CARE_BULK_WRITER_MIGRATION_GATES.length
);

// Even ten "verified" claims provide architecture-review eligibility only.
{
  const result = assessCareBulkWriterMigrationReadiness(complete());
  assert.equal(result.status, "eligible_for_architecture_review");
  assert.equal(result.inputRejected, false);
  assert.deepEqual(result.missingOrFailedGates, []);
  assert.deepEqual(result.diagnostics, [
    "review_eligible_not_authorized"
  ]);
  safe(result);
}
console.log("[PASS] Complete-looking claims remain non-authorizing");

// Every individual unverified or failed gate blocks readiness.
for (const gate of CARE_BULK_WRITER_MIGRATION_GATES) {
  for (const state of ["unverified", "failed"] as const) {
    const result = assessCareBulkWriterMigrationReadiness({
      ...complete(),
      [gate]: state
    });

    assert.equal(result.status, "not_ready", gate);
    assert.equal(result.inputRejected, false);
    assert.deepEqual(result.missingOrFailedGates, [gate]);
    assert.deepEqual(result.diagnostics, [
      `gate:${gate}:${state}`
    ]);
    safe(result);
  }
}
console.log("[PASS] Every incomplete or failed gate blocks readiness");

// Multiple gaps retain the canonical gate order, not caller key order.
{
  const result = assessCareBulkWriterMigrationReadiness({
    ...complete(),
    historical_completeness_verified: "failed",
    durable_membership_verified: "unverified",
    writer_coverage_verified: "failed"
  });

  assert.equal(result.status, "not_ready");
  assert.deepEqual(result.missingOrFailedGates, [
    "durable_membership_verified",
    "writer_coverage_verified",
    "historical_completeness_verified"
  ]);
  assert.deepEqual(result.diagnostics, [
    "gate:durable_membership_verified:unverified",
    "gate:writer_coverage_verified:failed",
    "gate:historical_completeness_verified:failed"
  ]);
  safe(result);
}
console.log("[PASS] Multiple failures preserve canonical order");

// Missing, unexpected, forged, and incorrectly typed claims fail closed.
const malformed: unknown[] = [
  null,
  undefined,
  false,
  123,
  "verified",
  [],
  {},
  { ...complete(), unexpected: "verified" },
  { ...complete(), writer_coverage_verified: true },
  { ...complete(), writer_coverage_verified: "approved" }
];

for (const input of malformed) {
  const result = assessCareBulkWriterMigrationReadiness(input);
  assert.equal(result.status, "not_ready");
  assert.equal(result.inputRejected, true);
  assert.deepEqual(
    result.missingOrFailedGates,
    [...CARE_BULK_WRITER_MIGRATION_GATES]
  );
  assert.deepEqual(result.diagnostics, [
    "migration_evidence_invalid_fail_closed"
  ]);
  safe(result);
}
console.log("[PASS] Malformed and forged claims fail closed");

// Accessor properties must not be executed to obtain evidence.
{
  let getterCalled = false;
  const input = { ...complete() };

  Object.defineProperty(input, "writer_coverage_verified", {
    configurable: true,
    enumerable: true,
    get() {
      getterCalled = true;
      throw new Error("synthetic_sensitive_value");
    }
  });

  const result = assessCareBulkWriterMigrationReadiness(input);
  assert.equal(getterCalled, false);
  assert.equal(result.status, "not_ready");
  assert.equal(result.inputRejected, true);
  safe(result);
}

// Inherited fields cannot satisfy required own-data evidence.
{
  const inherited = Object.create(complete());
  const result = assessCareBulkWriterMigrationReadiness(inherited);
  assert.equal(result.inputRejected, true);
  assert.equal(result.status, "not_ready");
  safe(result);
}

// Symbol keys, revoked proxies, and hostile reflection must fail closed.
{
  const symbolInput = {
    ...complete(),
    [Symbol("extra")]: "verified"
  };

  const revoked = Proxy.revocable(complete(), {});
  revoked.revoke();

  const hostile = new Proxy(complete(), {
    ownKeys() {
      throw new Error("synthetic_sensitive_value");
    }
  });

  for (const input of [symbolInput, revoked.proxy, hostile]) {
    const result = assessCareBulkWriterMigrationReadiness(input);
    assert.equal(result.status, "not_ready");
    assert.equal(result.inputRejected, true);
    assert.ok(
      !JSON.stringify(result.diagnostics).includes(
        "synthetic_sensitive_value"
      )
    );
    safe(result);
  }
}
console.log("[PASS] Accessors, inherited fields and hostile proxies rejected");

// Each gate value must be captured exactly once.
{
  let reads = 0;
  const input = new Proxy(complete(), {
    getOwnPropertyDescriptor(target, key) {
      if (key === "writer_coverage_verified") {
        reads++;
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: reads === 1 ? "failed" : "verified"
        };
      }

      return Reflect.getOwnPropertyDescriptor(target, key);
    }
  });

  const result = assessCareBulkWriterMigrationReadiness(input);
  assert.equal(reads, 1);
  assert.equal(result.status, "not_ready");
  assert.deepEqual(result.missingOrFailedGates, [
    "writer_coverage_verified"
  ]);
  safe(result);
}
console.log("[PASS] Stateful evidence is captured once and fails closed");
console.log("[PASS] All Bulk Care writer migration readiness proofs passed");
