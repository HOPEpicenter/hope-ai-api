import assert from "node:assert/strict";
import {
  validateFormationAssignmentLedgerRequest,
  nonAuthorizingAssignmentLedgerResult,
  type FormationAssignmentLedgerResultStatus
} from "../../src/services/authorization/formationAssignmentLedgerContract";

const base = {
  visitorId: "synthetic-visitor",
  operationId: "synthetic-operation-1",
  expectedRevision: 0
};

assert.deepEqual(
  validateFormationAssignmentLedgerRequest({
    ...base,
    kind: "assigned",
    assigneeId: "synthetic-staff"
  }),
  {
    ...base,
    kind: "assigned",
    assigneeId: "synthetic-staff"
  }
);

assert.deepEqual(
  validateFormationAssignmentLedgerRequest({
    ...base,
    kind: "unassigned"
  }),
  {
    ...base,
    kind: "unassigned",
    assigneeId: null
  }
);

for (const input of [
  null,
  [],
  {},
  { ...base, visitorId: "" },
  { ...base, visitorId: " visitor" },
  { ...base, visitorId: "visitor/other" },
  { ...base, operationId: "" },
  { ...base, operationId: "operation other" },
  { ...base, expectedRevision: -1 },
  { ...base, expectedRevision: 1.5 },
  { ...base, expectedRevision: Number.MAX_SAFE_INTEGER },
  { ...base, expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
  { ...base, kind: "assigned" },
  { ...base, kind: "assigned", assigneeId: "" },
  { ...base, kind: "assigned", assigneeId: " staff" },
  { ...base, kind: "unassigned", assigneeId: "synthetic-staff" },
  { ...base, kind: "other", assigneeId: "synthetic-staff" }
]) {
  assert.equal(
    validateFormationAssignmentLedgerRequest(input),
    null,
    "Malformed ledger request must fail closed"
  );
}

const maximumValidRevision = Number.MAX_SAFE_INTEGER - 1;

assert.deepEqual(
  validateFormationAssignmentLedgerRequest({
    ...base,
    expectedRevision: maximumValidRevision,
    kind: "assigned",
    assigneeId: "synthetic-staff"
  }),
  {
    ...base,
    expectedRevision: maximumValidRevision,
    kind: "assigned",
    assigneeId: "synthetic-staff"
  }
);

assert.equal(
  validateFormationAssignmentLedgerRequest({
    ...base,
    expectedRevision: Number.MAX_SAFE_INTEGER,
    kind: "assigned",
    assigneeId: "synthetic-staff"
  }),
  null
);

const revokedProxy = Proxy.revocable({}, {});
revokedProxy.revoke();

assert.doesNotThrow(() => {
  assert.equal(
    validateFormationAssignmentLedgerRequest(revokedProxy.proxy),
    null
  );
});
const statuses: FormationAssignmentLedgerResultStatus[] = [
  "committed",
  "invalid_input",
  "conflict",
  "replay",
  "unavailable",
  "uncertain"
];

for (const status of statuses) {
  const result = nonAuthorizingAssignmentLedgerResult(status, 1);

  assert.equal(result.status, status);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.retryPermitted, false);

  if (status !== "committed") {
    assert.equal(result.revision, undefined);
  }
}

assert.deepEqual(
  nonAuthorizingAssignmentLedgerResult("committed", 1),
  {
    status: "committed",
    revision: 1,
    authorizationPermitted: false,
    retryPermitted: false
  }
);

assert.equal(
  nonAuthorizingAssignmentLedgerResult("committed", 0).revision,
  undefined
);

console.log(
  "Formation assignment ledger non-authorizing contract assertions passed."
);