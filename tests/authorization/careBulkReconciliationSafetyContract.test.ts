import assert from "node:assert/strict";
import {
  assessCareBulkReconciliation
} from "../../src/services/authorization/careBulkReconciliationSafetyContract";

function operation(
  visitorId: string,
  operationId: string,
  ledgerObservation: string
) {
  return { visitorId, operationId, ledgerObservation };
}

function evidence(
  visitorIds: string[],
  operations: unknown[]
) {
  return { visitorIds, operations };
}

function assertNeverAuthorizes(input: unknown): void {
  const result = assessCareBulkReconciliation(input);

  assert.equal(result.reconciliationRequired, true);
  assert.equal(result.manualInterventionRequired, true);
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.authoritative, false);
  assert.equal(result.complete, false);
  assert.equal(result.writerCoverageVerified, false);
  assert.equal(result.historicalReconciliationVerified, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}

function run(): void {
  const fullyObserved = evidence(
    ["visitor-a", "visitor-b"],
    [
      operation("visitor-a", "operation-a", "observed_current"),
      operation("visitor-b", "operation-b", "observed_historical")
    ]
  );

  const observed = assessCareBulkReconciliation(fullyObserved);

  assert.equal(observed.status, "observations_consistent_not_complete");
  assert.equal(observed.inputRejected, false);
  assert.equal(observed.intendedVisitorCount, 2);
  assert.equal(observed.assessedVisitorCount, 2);
  assert.deepEqual(observed.unresolvedVisitorIds, []);
  assert.equal(observed.reconciliationRequired, true);
  assertNeverAuthorizes(fullyObserved);

  const missing = evidence(
    ["visitor-a", "visitor-b"],
    [operation("visitor-a", "operation-a", "observed_current")]
  );

  const missingResult = assessCareBulkReconciliation(missing);

  assert.equal(missingResult.status, "requires_reconciliation");
  assert.deepEqual(missingResult.unresolvedVisitorIds, ["visitor-b"]);
  assert.equal(missingResult.reconciliationRequired, true);
  assert.equal(missingResult.manualInterventionRequired, true);
  assertNeverAuthorizes(missing);

  for (const observation of [
    "absent_or_unavailable",
    "not_inspected"
  ]) {
    const input = evidence(
      ["visitor-a"],
      [operation("visitor-a", "operation-a", observation)]
    );

    const result = assessCareBulkReconciliation(input);

    assert.equal(result.status, "requires_reconciliation");
    assert.deepEqual(result.unresolvedVisitorIds, ["visitor-a"]);
    assertNeverAuthorizes(input);
  }

  const inconsistent = evidence(
    ["visitor-a"],
    [operation("visitor-a", "operation-a", "inconsistent")]
  );

  const contradictory = assessCareBulkReconciliation(inconsistent);

  assert.equal(contradictory.status, "contradictory");
  assert.equal(contradictory.reconciliationRequired, true);
  assert.equal(contradictory.manualInterventionRequired, true);
  assertNeverAuthorizes(inconsistent);

  const sparseVisitors = new Array(1);
  const sparseOperations = new Array(1);

  const invalidCases: unknown[] = [
    evidence(sparseVisitors, []),
    evidence(["visitor-a"], sparseOperations),
    null,
    undefined,
    {},
    [],
    evidence([], []),
    evidence(["visitor-a", "visitor-a"], []),
    evidence(["visitor-a"], [
      operation("visitor-a", "operation-a", "observed_current"),
      operation("visitor-a", "operation-b", "observed_current")
    ]),
    evidence(["visitor-a", "visitor-b"], [
      operation("visitor-a", "same-operation", "observed_current"),
      operation("visitor-b", "same-operation", "observed_current")
    ]),
    evidence(["visitor-a"], [
      operation("visitor-other", "operation-a", "observed_current")
    ]),
    evidence(["visitor-a"], [
      operation("visitor-a", "operation-a", "unexpected_status")
    ]),
    evidence([" visitor-a"], []),
    evidence(["visitor/a"], []),
    evidence(["visitor-a"], [{
      visitorId: "visitor-a",
      operationId: "operation-a",
      ledgerObservation: "observed_current",
      unexpected: true
    }]),
    {
      visitorIds: ["visitor-a"],
      operations: [],
      complete: true
    },
    evidence(
      Array.from({ length: 1001 }, (_, i) => `visitor-${i}`),
      []
    ),
    evidence(
      ["visitor-a"],
      Array.from({ length: 1001 }, (_, i) =>
        operation("visitor-a", `operation-${i}`, "not_inspected")
      )
    )
  ];

  for (const invalid of invalidCases) {
    const result = assessCareBulkReconciliation(invalid);
    assert.equal(result.status, "invalid_input");
    assert.equal(result.inputRejected, true);
    assert.equal(result.reconciliationRequired, true);
    assert.equal(result.manualInterventionRequired, true);
    assertNeverAuthorizes(invalid);
  }

  const accessor = Object.defineProperty({}, "visitorIds", {
    get() {
      throw new Error("Hostile accessor");
    },
    enumerable: true
  });

  const hostileProxy = new Proxy({}, {
    ownKeys() {
      throw new Error("Hostile reflection");
    }
  });

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();

  for (const hostile of [accessor, hostileProxy, revoked.proxy]) {
    const result = assessCareBulkReconciliation(hostile);
    assert.equal(result.status, "invalid_input");
    assert.equal(result.inputRejected, true);
    assertNeverAuthorizes(hostile);
  }

  console.log(
    "Care bulk reconciliation safety contract tests passed."
  );
}

run();
