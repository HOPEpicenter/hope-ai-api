import assert from "node:assert/strict";
import {
  inspectStaffInvitationAuditReadback,
  type AuditReadbackRequest
} from "../../src/services/staff/inspectStaffInvitationAuditReadback";

import {
  STAFF_INVITATION_AUDIT_PARTITION,
  STAFF_INVITATION_AUDIT_SOURCE
} from "../../src/repositories/staffInvitationAuditTableRecorderPrototype";

const request = {
  operationId: "c4653c42-9c4b-4c4e-b214-647d42125120",
  actorCorrelationId: "a8f20139-bbd7-4d1f-8ceb-3a183113e84d",
  canonicalStaffId: "staff-synthetic-admin",
  action: "create"
} as const;

function row(
  phase: "attempt" | "outcome",
  eventId: string
) {
  return {
    partitionKey: STAFF_INVITATION_AUDIT_PARTITION,
    rowKey: `audit-${eventId}`,
    schemaVersion: 1,
    source: STAFF_INVITATION_AUDIT_SOURCE,
    eventId,
    occurredAt: "2026-11-03T12:00:00.000Z",
    operationId: request.operationId,
    actorCorrelationId: request.actorCorrelationId,
    canonicalStaffId: request.canonicalStaffId,
    action: request.action,
    phase,
    status: phase === "attempt"
      ? "attempted"
      : "recorded_unverified"
  };
}

const attempt = row(
  "attempt", "11111111-1111-4111-8111-111111111111"
);

const outcome = row(
  "outcome", "22222222-2222-4222-8222-222222222222"
);

async function main(): Promise<void> {
  let calls = 0;
  let rows: readonly unknown[] = [attempt, outcome];

  const port = {
    async readRows(_request: AuditReadbackRequest) {
      calls++;
      return rows;
    }
  };

  async function inspect(input: unknown = request) {
    return inspectStaffInvitationAuditReadback(input, port);
  }

  const matching = await inspect();

  assert.equal(matching.status, "matching_evidence");

  for (const key of [
    "authoritative",
    "independentlyVerifiedDurability",
    "storageAccessPermitted",
    "executionPermitted",
    "retryPermitted",
    "productionRolloutPermitted"
  ] as const) {
    assert.equal(matching[key], false);
  }

  console.log("PASS two matching audit events remain non-authorizing");

  rows = [];
  assert.equal((await inspect()).status, "missing");

  rows = [attempt];
  assert.equal((await inspect()).status, "incomplete");

  console.log("PASS missing and incomplete evidence distinguished");

  rows = [attempt, attempt];
  assert.equal((await inspect()).status, "contradictory");

  rows = [attempt, outcome, outcome];
  assert.equal((await inspect()).status, "contradictory");

  rows = [
    attempt,
    { ...outcome, canonicalStaffId: "other-admin" }
  ];
  assert.equal((await inspect()).status, "contradictory");

  rows = [
    attempt,
    { ...outcome, operationId:
      "b4653c42-9c4b-4c4e-b214-647d42125120" }
  ];
  assert.equal((await inspect()).status, "contradictory");

  console.log("PASS duplicate and mismatched attribution rejected");

  rows = [attempt, {
    ...outcome,
    status: "authorized"
  }];

  assert.equal((await inspect()).status, "contradictory");

  rows = [attempt, {
    ...outcome,
    source: "untrusted-source"
  }];

  assert.equal((await inspect()).status, "contradictory");

  console.log("PASS invalid outcome and source rejected");

  const before = calls;

  assert.equal(
    (await inspect({ ...request, operationId: "invalid" })).status,
    "invalid_input"
  );

  assert.equal(calls, before);

  console.log("PASS invalid request blocks read port");

  rows = [attempt, outcome];

  let getterCalled = false;
  const hostile = Object.defineProperty(
    { ...outcome },
    "status",
    {
      enumerable: true,
      get() {
        getterCalled = true;
        throw Error("Hostile status getter");
      }
    }
  );

  rows = [attempt, hostile];

  assert.equal((await inspect()).status, "contradictory");
  assert.equal(getterCalled, false);

  console.log("PASS hostile evidence getter not executed");

  const revoked = Proxy.revocable(outcome, {});
  revoked.revoke();

  rows = [attempt, revoked.proxy];

  assert.equal((await inspect()).status, "contradictory");

  console.log("PASS revoked evidence proxy rejected");

  const unavailablePort = {
    async readRows(): Promise<readonly unknown[]> {
      throw new Error("synthetic unavailable read");
    }
  };

  const unavailable = await inspectStaffInvitationAuditReadback(
    request, unavailablePort
  );

  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.retryPermitted, false);

  console.log("PASS read failure remains unavailable without retry");
  console.log("PASS C6 synthetic audit readback regressions");
}

main().catch(error => {
  console.error("C6 audit readback regression failed");
  console.error(
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 1;
});
