import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import {
  StaffInvitationAuditTableRecorderPrototype
} from "../../src/repositories/staffInvitationAuditTableRecorderPrototype";
import type {
  InvitationAuditEvent
} from "../../src/repositories/staffInvitationAuditedStorageAdapter";
import type {
  ProtectedInvitationAuditActorResult
} from "../../src/services/staff/resolveProtectedInvitationAuditActor";

const correlation =
  "a8f20139-bbd7-4d1f-8ceb-3a183113e84d";

const event: InvitationAuditEvent = {
  schemaVersion: 1,
  action: "create",
  phase: "attempt",
  status: "attempted",
  operationId: "c4653c42-9c4b-4c4e-b214-647d42125120",
  actorCorrelationId: correlation
};

const valid: ProtectedInvitationAuditActorResult = {
  status: "authenticated_admin_bound",
  actor: {
    canonicalStaffId: "staff-synthetic-admin",
    actorCorrelationId: correlation
  },
  authoritative: false,
  storageAccessPermitted: false,
  invitationExecutionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
};

async function main(): Promise<void> {
  const rows: Record<string, unknown>[] = [];
  let calls = 0;

  const table = {
    async createEntity(
      row: Record<string, unknown>
    ): Promise<unknown> {
      calls++;
      rows.push({ ...row });
      return {};
    }
  } as unknown as Pick<TableClient, "createEntity">;

  const bound = new StaffInvitationAuditTableRecorderPrototype(
    table, valid
  );

  await bound.record(event);
  await bound.record({
    ...event,
    phase: "outcome",
    status: "recorded_unverified"
  });

  assert.equal(calls, 2);
  assert.equal(rows.length, 2);

  for (const row of rows) {
    assert.equal(row.canonicalStaffId, "staff-synthetic-admin");
    assert.equal(row.actorCorrelationId, correlation);
    assert.equal(row.operationId, event.operationId);
    assert.equal("recipientEmail" in row, false);
    assert.equal("displayName" in row, false);
    assert.equal("intentJson" in row, false);
  }

  assert.notEqual(rows[0].rowKey, rows[1].rowKey);
  console.log("PASS canonical actor attribution persisted in both phases");

  const count = calls;

  await assert.rejects(
    bound.record({
      ...event,
      actorCorrelationId: "b8f20139-bbd7-4d1f-8ceb-3a183113e84d"
    }),
    /actor binding rejected/
  );

  assert.equal(calls, count);
  console.log("PASS correlation mismatch blocks audit write");

  const unauthorized = new StaffInvitationAuditTableRecorderPrototype(
    table,
    {
      ...valid,
      status: "rejected",
      actor: null
    } as ProtectedInvitationAuditActorResult
  );

  await assert.rejects(unauthorized.record(event));
  assert.equal(calls, count);

  console.log("PASS rejected authorization result blocks audit write");

  let getterExecuted = false;

  const hostile = Object.defineProperty(
    { ...valid },
    "actor",
    {
      enumerable: true,
      get() {
        getterExecuted = true;
        throw new Error("hostile actor getter");
      }
    }
  );

  const hostileRecorder = new StaffInvitationAuditTableRecorderPrototype(
    table,
    hostile as ProtectedInvitationAuditActorResult
  );

  await assert.rejects(hostileRecorder.record(event));
  assert.equal(getterExecuted, false);
  assert.equal(calls, count);

  console.log("PASS hostile actor getter never executed");

  const revoked = Proxy.revocable({ ...valid }, {});
  revoked.revoke();

  const revokedRecorder = new StaffInvitationAuditTableRecorderPrototype(
    table,
    revoked.proxy
  );

  await assert.rejects(revokedRecorder.record(event));
  assert.equal(calls, count);

  console.log("PASS revoked binding proxy blocks audit write");

  const unbound = new StaffInvitationAuditTableRecorderPrototype(
    table
  );

  await unbound.record(event);

  assert.equal(calls, count + 1);
  assert.equal("canonicalStaffId" in rows[rows.length - 1], false);

  console.log("PASS original unbound recorder contract preserved");
  console.log("PASS C6 attributed audit recorder regressions");
}

main().catch(error => {
  console.error("Attributed audit recorder regression failed");
  console.error(
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 1;
});
