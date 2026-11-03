import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";

import {
  createStaffInvitationAuditReadPort
} from "../../src/repositories/staffInvitationAuditReadPort";

import {
  inspectStaffInvitationAuditReadback
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
    eventId,
    schemaVersion: 1,
    source: STAFF_INVITATION_AUDIT_SOURCE,
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
  "attempt",
  "11111111-1111-4111-8111-111111111111"
);

const outcome = row(
  "outcome",
  "22222222-2222-4222-8222-222222222222"
);

async function main(): Promise<void> {
  let selectedRows: readonly unknown[] = [
    attempt, outcome
  ];

  let calls = 0;
  let yielded = 0;
  let filterSeen = "";

  const table = {
    async *listEntities(options: {
      queryOptions?: { filter?: string };
    }) {
      calls++;
      filterSeen = options.queryOptions?.filter ?? "";

      // Simulate the Azure server-side operation-level filter.
      for (const entry of selectedRows) {
        const candidate = entry as Record<string, unknown>;

        if (
          candidate.partitionKey !== STAFF_INVITATION_AUDIT_PARTITION ||
          candidate.operationId !== request.operationId
        ) continue;

        yielded++;
        yield entry;
      }
    }
  } as unknown as Pick<TableClient, "listEntities">;

  const port = createStaffInvitationAuditReadPort(table);

  const inspect = () =>
    inspectStaffInvitationAuditReadback(request, port);

  const expectedFilter =
    `PartitionKey eq '${STAFF_INVITATION_AUDIT_PARTITION}'` +
    ` and operationId eq '${request.operationId}'`;

  const matching = await inspect();

  assert.equal(matching.status, "matching_evidence");
  assert.equal(matching.independentlyVerifiedDurability, false);
  assert.equal(matching.executionPermitted, false);
  assert.equal(filterSeen, expectedFilter);
  assert.equal(yielded, 2);

  console.log("PASS exact partition and operation-level query");

  selectedRows = [];
  assert.equal((await inspect()).status, "missing");

  selectedRows = [attempt];
  assert.equal((await inspect()).status, "incomplete");

  console.log("PASS empty and incomplete query results");

  selectedRows = [
    attempt,
    outcome,
    {
      ...outcome,
      eventId: "33333333-3333-4333-8333-333333333333",
      rowKey: "audit-33333333-3333-4333-8333-333333333333"
    }
  ];

  yielded = 0;

  const extra = await inspect();

  assert.equal(extra.status, "contradictory");
  assert.equal(yielded, 3);

  console.log("PASS third conflicting record is not hidden");

  selectedRows = [
    attempt,
    outcome,
    {
      ...outcome,
      actorCorrelationId:
        "f8f20139-bbd7-4d1f-8ceb-3a183113e84d",
      eventId: "44444444-4444-4444-8444-444444444444",
      rowKey: "audit-44444444-4444-4444-8444-444444444444"
    }
  ];

  yielded = 0;

  assert.equal((await inspect()).status, "contradictory");
  assert.equal(yielded, 3);
  assert.equal(filterSeen, expectedFilter);

  console.log("PASS cross-correlation conflict cannot be filtered away");

  selectedRows = [
    attempt,
    {
      ...outcome,
      actorCorrelationId:
        "f8f20139-bbd7-4d1f-8ceb-3a183113e84d"
    }
  ];

  assert.equal((await inspect()).status, "contradictory");

  console.log("PASS two-row correlation mismatch is rejected");

  selectedRows = [
    attempt,
    { ...outcome, canonicalStaffId: "wrong-staff" }
  ];

  assert.equal((await inspect()).status, "contradictory");

  selectedRows = [
    attempt,
    { ...outcome, action: "read" }
  ];

  assert.equal((await inspect()).status, "contradictory");

  console.log("PASS conflicting actor and action remain visible");

  selectedRows = [attempt, outcome];

  const before = calls;

  await assert.rejects(
    port.readRows({
      ...request,
      operationId: "' or PartitionKey ne '"
    })
  );

  assert.equal(calls, before);

  console.log("PASS invalid filter input blocks table query");

  const brokenTable = {
    async *listEntities() {
      yield attempt;
      yield outcome;
      throw new Error("Synthetic pagination failure");
    }
  } as unknown as Pick<TableClient, "listEntities">;

  const brokenPort =
    createStaffInvitationAuditReadPort(brokenTable);

  const failed = await inspectStaffInvitationAuditReadback(
    request, brokenPort
  );

  assert.equal(failed.status, "unavailable");
  assert.equal(failed.retryPermitted, false);

  console.log("PASS failed pagination never becomes matching evidence");

  let writes = 0;

  const readOnlyTable = {
    async *listEntities() {
      yield attempt;
      yield outcome;
    },
    async createEntity() {
      writes++;
      throw new Error("Write must never occur");
    },
    async createTable() {
      writes++;
      throw new Error("Table creation must never occur");
    }
  } as unknown as Pick<TableClient, "listEntities">;

  const readOnlyPort =
    createStaffInvitationAuditReadPort(readOnlyTable);

  assert.equal(
    (await inspectStaffInvitationAuditReadback(
      request, readOnlyPort
    )).status,
    "matching_evidence"
  );

  assert.equal(writes, 0);

  console.log("PASS readback performs no create or write operation");
  console.log("PASS C6 synthetic Azure audit read port regressions");
}

main().catch(error => {
  console.error("C6 audit read port regression failed");
  console.error(
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 1;
});
