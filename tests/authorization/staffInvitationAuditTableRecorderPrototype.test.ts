import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import {
  StaffInvitationAuditTableRecorderPrototype,
  STAFF_INVITATION_AUDIT_PARTITION,
  STAFF_INVITATION_AUDIT_SOURCE
} from "../../src/repositories/staffInvitationAuditTableRecorderPrototype";
import type {
  InvitationAuditEvent
} from "../../src/repositories/staffInvitationAuditedStorageAdapter";

const operationId = "c4653c42-9c4b-4c4e-b214-647d42125120";
const actorCorrelationId = "a8f20139-bbd7-4d1f-8ceb-3a183113e84d";

const attempt: InvitationAuditEvent = {
  schemaVersion: 1,
  action: "create",
  phase: "attempt",
  status: "attempted",
  operationId,
  actorCorrelationId
};

async function main(): Promise<void> {
  const stored: Record<string, unknown>[] = [];
  let calls = 0;
  let fail = false;

  const table = {
    async createEntity(
      entity: Record<string, unknown>
    ): Promise<unknown> {
      calls++;
      if (fail) throw new Error("recipientEmail=private@example.org; synthetic failure");
      stored.push({ ...entity });
      return {};
    }
  } as unknown as Pick<TableClient, "createEntity">;

  const recorder = new StaffInvitationAuditTableRecorderPrototype(table);

  await recorder.record(attempt);
  await recorder.record({
    ...attempt,
    phase: "outcome",
    status: "recorded_unverified"
  });

  assert.equal(calls, 2);
  assert.equal(stored.length, 2);
  assert.equal(
    stored[0].partitionKey,
    STAFF_INVITATION_AUDIT_PARTITION
  );
  assert.equal(stored[0].source, STAFF_INVITATION_AUDIT_SOURCE);
  assert.notEqual(stored[0].rowKey, stored[1].rowKey);

  for (const entity of stored) {
    assert.equal(entity.operationId, operationId);
    assert.equal(entity.actorCorrelationId, actorCorrelationId);
    assert.match(String(entity.rowKey), /^audit-[0-9a-f-]{36}$/);
    assert.equal(
      new Date(String(entity.occurredAt)).toISOString(),
      entity.occurredAt
    );
    assert.ok(!("displayName" in entity));
    assert.ok(!("recipientEmail" in entity));
    assert.ok(!("actorId" in entity));
    assert.ok(!("intentJson" in entity));
  }

  console.log("PASS create-only distinct audit event entities");

  await recorder.record({
    ...attempt,
    action: "read",
    phase: "outcome",
    status: "matching_evidence"
  });

  assert.equal(calls, 3);
  console.log("PASS read outcome stored independently");

  const before = calls;

  for (const invalid of [
    { ...attempt, status: "matching_evidence" },
    { ...attempt, action: "delete" },
    { ...attempt, recipientEmail: "private@example.org" },
    { ...attempt, operationId: "invalid" },
    { ...attempt, actorCorrelationId: "invalid" },
    { ...attempt, phase: "outcome", status: "attempted" },
    { ...attempt, action: "read", phase: "outcome",
      status: "recorded_unverified" }
  ]) {
    await assert.rejects(
      recorder.record(invalid as InvitationAuditEvent)
    );
  }

  assert.equal(calls, before);
  console.log("PASS malformed and cross-operation events rejected");

  let getterCalled = false;
  const hostile = Object.defineProperty({ ...attempt }, "status", {
    enumerable: true,
    get() {
      getterCalled = true;
      throw new Error("getter executed");
    }
  });

  await assert.rejects(
    recorder.record(hostile as InvitationAuditEvent)
  );
  assert.equal(getterCalled, false);
  assert.equal(calls, before);

  const revoked = Proxy.revocable({ ...attempt }, {});
  revoked.revoke();

  await assert.rejects(
    recorder.record(revoked.proxy as InvitationAuditEvent)
  );
  assert.equal(calls, before);

  console.log("PASS getter and revoked proxy fail before storage");

  fail = true;

  await assert.rejects(
    recorder.record(attempt),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "Invitation audit persistence uncertain"
      );
      assert.equal(
        Object.prototype.hasOwnProperty.call(error, "cause"),
        false
      );
      assert.ok(!error.message.includes("recipientEmail"));
      assert.ok(!error.message.includes("private@example.org"));
      return true;
    }
  );

  assert.equal(calls, before + 1);
  console.log("PASS uncertain storage failure sanitized without retry");

  console.log("PASS C6 isolated audit-table recorder regressions");
}

main().catch(error => {
  console.error("C6 audit-table recorder regression failed");
  console.error(error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
