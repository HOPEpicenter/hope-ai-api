import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";

import {
  runProtectedStaffInvitationAuditOperation
} from "../../src/services/staff/runProtectedStaffInvitationAuditOperation";

import type {
  StaffInvitationIntentStorageResult,
  StaffInvitationIntentReadResult
} from "../../src/repositories/staffInvitationIntentStoragePrototypeRepository";

const verification = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  audience: "api://synthetic-backend",
  requiredPermissions: { scopes: ["Staff.Access"] }
};

const administrators = {
  administratorStaffIds: ["staff-synthetic-admin"]
};

const intent = {
  schemaVersion: 1,
  sourceIdentity: "staff-invitation-intent-v1",
  operationId: "c4653c42-9c4b-4c4e-b214-647d42125120",
  actorId: "staff-synthetic-admin",
  displayName: "Synthetic Staff",
  recipientEmail: "synthetic@example.org",
  createdAt: "2026-11-01T00:00:00.000Z"
};

const denial = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  graphOutcomeVerified: false,
  productionRolloutPermitted: false
} as const;

async function main(): Promise<void> {
  let authorizationCalls = 0;
  let writes = 0;
  let reads = 0;
  let auditCalls = 0;
  let auditFailureAt = -1;
  let allowed = true;

  const records: Record<string, unknown>[] = [];

  const authorizeAction = (async () => {
    authorizationCalls++;

    return allowed
      ? {
          allowed: true,
          authenticatedStaffId: "staff-synthetic-admin",
          action: "system.admin"
        }
      : {
          allowed: false,
          reason: "insufficient_authority"
        };
  }) as unknown as NonNullable<
    Parameters<typeof runProtectedStaffInvitationAuditOperation>[6]
  >["authorizeAction"];

  const ports = {
    storage: {
      async recordIntent(): Promise<StaffInvitationIntentStorageResult> {
        writes++;
        return { status: "recorded_unverified", ...denial };
      },
      async inspectIntent(): Promise<StaffInvitationIntentReadResult> {
        reads++;
        return { status: "matching_evidence", ...denial };
      }
    },
    auditTable: {
      async createEntity(
        row: Record<string, unknown>
      ): Promise<unknown> {
        auditCalls++;

        if (auditCalls === auditFailureAt) {
          throw new Error("synthetic audit failure");
        }

        records.push({ ...row });
        return {};
      }
    } as unknown as Pick<TableClient, "createEntity">
  };

  const execute = (
    action: unknown,
    input: unknown = intent
  ) => runProtectedStaffInvitationAuditOperation(
    "synthetic-token",
    verification,
    administrators,
    action,
    input,
    ports,
    { authorizeAction }
  );

  const first = await execute("create");

  assert.equal(first.status, "recorded_unverified");
  assert.equal(first.authoritative, false);
  assert.equal(first.executionPermitted, false);
  assert.equal(first.retryPermitted, false);
  assert.equal(first.productionRolloutPermitted, false);
  assert.equal(writes, 1);
  assert.equal(reads, 0);
  assert.equal(records.length, 2);

  assert.equal(records[0].phase, "attempt");
  assert.equal(records[1].phase, "outcome");
  assert.equal(records[0].canonicalStaffId, intent.actorId);
  assert.equal(records[1].canonicalStaffId, intent.actorId);
  assert.equal(
    records[0].actorCorrelationId,
    records[1].actorCorrelationId
  );
  assert.notEqual(records[0].rowKey, records[1].rowKey);

  for (const row of records) {
    assert.equal("recipientEmail" in row, false);
    assert.equal("displayName" in row, false);
    assert.equal("intentJson" in row, false);
  }

  console.log("PASS authorized synthetic create binds both audit phases");

  const inspected = await execute("read");

  assert.equal(inspected.status, "matching_evidence");
  assert.equal(reads, 1);
  assert.equal(records.length, 4);
  assert.equal(records[2].canonicalStaffId, intent.actorId);
  assert.equal(records[3].canonicalStaffId, intent.actorId);
  assert.notEqual(
    records[0].actorCorrelationId,
    records[2].actorCorrelationId
  );

  console.log("PASS authorized synthetic read uses new correlation");

  const beforeAuth = authorizationCalls;
  const beforeAudit = auditCalls;

  assert.equal((await execute("delete")).status, "invalid_input");
  assert.equal(
    (await execute("create", { ...intent, operationId: "bad" })).status,
    "invalid_input"
  );

  assert.equal(authorizationCalls, beforeAuth);
  assert.equal(auditCalls, beforeAudit);

  console.log("PASS unsupported and malformed operations short-circuit");

  const beforeWrites = writes;
  const beforeReads = reads;

  assert.equal(
    (await execute("create", {
      ...intent,
      actorId: "different-staff"
    })).status,
    "rejected"
  );

  assert.equal(writes, beforeWrites);
  assert.equal(reads, beforeReads);
  assert.equal(auditCalls, beforeAudit);

  console.log("PASS claimed actor mismatch blocks audit and storage");

  allowed = false;

  assert.equal((await execute("create")).status, "rejected");
  assert.equal(writes, beforeWrites);
  assert.equal(auditCalls, beforeAudit);

  console.log("PASS unauthorized actor blocks audit and storage");

  allowed = true;
  auditCalls = 0;
  auditFailureAt = 1;

  const noAttempt = await execute("create");

  assert.equal(noAttempt.status, "uncertain");
  assert.equal(writes, beforeWrites);

  console.log("PASS failed pre-access audit blocks storage");

  auditCalls = 0;
  auditFailureAt = 2;

  const uncertain = await execute("create");

  assert.equal(uncertain.status, "uncertain");
  assert.equal(writes, beforeWrites + 1);
  assert.equal(uncertain.executionPermitted, false);
  assert.equal(uncertain.retryPermitted, false);

  console.log("PASS failed outcome audit preserves uncertainty");

  auditCalls = 0;
  auditFailureAt = -1;

  const recovered = await execute("create");

  assert.equal(recovered.status, "recorded_unverified");
  assert.equal(recovered.executionPermitted, false);

  console.log("PASS synthetic recovery remains non-authorizing");
  console.log("PASS C6 guarded integration composition regressions");
}

main().catch(error => {
  console.error("Guarded C6 integration regression failed");
  console.error(
    error instanceof Error ? error.message : "Unknown error"
  );
  process.exitCode = 1;
});
