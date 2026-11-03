import assert from "node:assert/strict";
import type {
  StaffInvitationIntentStorageResult,
  StaffInvitationIntentReadResult
} from "../../src/repositories/staffInvitationIntentStoragePrototypeRepository";
import {
  StaffInvitationAuditedStorageAdapter,
  type InvitationAuditEvent
} from "../../src/repositories/staffInvitationAuditedStorageAdapter";

const intent = {
  schemaVersion: 1,
  sourceIdentity: "staff-invitation-intent-v1",
  operationId: "c4653c42-9c4b-4c4e-b214-647d42125120",
  actorId: "synthetic-admin",
  displayName: "Synthetic Staff",
  recipientEmail: "synthetic@example.org",
  createdAt: "2026-11-01T00:00:00.000Z"
};

const actor = "a8f20139-bbd7-4d1f-8ceb-3a183113e84d";

const denied = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  automaticRecoveryPermitted: false,
  graphOutcomeVerified: false,
  productionRolloutPermitted: false
} as const;

function writeResult(
  status: StaffInvitationIntentStorageResult["status"]
): StaffInvitationIntentStorageResult {
  return Object.freeze({ status, ...denied });
}

function readResult(
  status: StaffInvitationIntentReadResult["status"]
): StaffInvitationIntentReadResult {
  return Object.freeze({ status, ...denied });
}

async function main(): Promise<void> {
  let writes = 0;
  let reads = 0;
  let failAuditAt = -1;
  let call = 0;

  const events: InvitationAuditEvent[] = [];

  const audit = {
    async record(event: InvitationAuditEvent): Promise<void> {
      call++;
      if (call === failAuditAt) {
        throw new Error("synthetic audit failure");
      }

      assert.ok(Object.isFrozen(event));

      const json = JSON.stringify(event);
      assert.ok(!json.includes(intent.displayName));
      assert.ok(!json.includes(intent.recipientEmail));
      assert.ok(!json.includes(intent.actorId));
      assert.equal(event.operationId, intent.operationId);
      assert.equal(event.actorCorrelationId, actor);

      events.push(event);
    }
  };

  const storage = {
    async recordIntent(): Promise<StaffInvitationIntentStorageResult> {
      writes++;
      return writeResult("recorded_unverified");
    },
    async inspectIntent(): Promise<StaffInvitationIntentReadResult> {
      reads++;
      return readResult("matching_evidence");
    }
  };

  function adapter(
    correlationId = actor
  ): StaffInvitationAuditedStorageAdapter {
    return new StaffInvitationAuditedStorageAdapter(
      storage, audit, correlationId
    );
  }

  const first = await adapter().recordIntent(intent);
  assert.equal(first.status, "recorded_unverified");
  assert.equal(writes, 1);
  assert.equal(events.length, 2);
  assert.equal(events[0].phase, "attempt");
  assert.equal(events[1].phase, "outcome");
  assert.equal(events[1].status, "recorded_unverified");
  assert.equal(first.executionPermitted, false);
  console.log("PASS create records attempt and reported outcome");

  events.length = 0;
  const read = await adapter().inspectIntent(intent);
  assert.equal(read.status, "matching_evidence");
  assert.equal(reads, 1);
  assert.equal(events.length, 2);
  assert.equal(events[0].action, "read");
  assert.equal(events[1].status, "matching_evidence");
  console.log("PASS read records attempt and reported outcome");

  const beforeWrites = writes;
  const beforeReads = reads;

  assert.equal(
    (await adapter().recordIntent({ ...intent, operationId: "bad" })).status,
    "invalid_input"
  );
  assert.equal(
    (await adapter("bad").inspectIntent(intent)).status,
    "invalid_input"
  );

  assert.equal(writes, beforeWrites);
  assert.equal(reads, beforeReads);
  console.log("PASS invalid input and actor correlation block storage");

  call = 0;
  failAuditAt = 1;

  assert.equal(
    (await adapter().recordIntent(intent)).status,
    "uncertain"
  );
  assert.equal(writes, beforeWrites);

  call = 0;
  assert.equal(
    (await adapter().inspectIntent(intent)).status,
    "unavailable"
  );
  assert.equal(reads, beforeReads);
  console.log("PASS missing pre-access audit blocks storage");

  call = 0;
  failAuditAt = 2;

  assert.equal(
    (await adapter().recordIntent(intent)).status,
    "uncertain"
  );
  assert.equal(writes, beforeWrites + 1);

  call = 0;
  assert.equal(
    (await adapter().inspectIntent(intent)).status,
    "unavailable"
  );
  assert.equal(reads, beforeReads + 1);
  console.log("PASS failed outcome audit never claims reliable result");

  failAuditAt = -1;
  call = 0;

  const throwingStorage = {
    async recordIntent(): Promise<StaffInvitationIntentStorageResult> {
      throw new Error("synthetic write uncertainty");
    },
    async inspectIntent(): Promise<StaffInvitationIntentReadResult> {
      throw new Error("synthetic read failure");
    }
  };

  const throwingAdapter = new StaffInvitationAuditedStorageAdapter(
    throwingStorage, audit, actor
  );

  assert.equal(
    (await throwingAdapter.recordIntent(intent)).status,
    "uncertain"
  );
  assert.equal(
    (await throwingAdapter.inspectIntent(intent)).status,
    "unavailable"
  );
  console.log("PASS storage exceptions fail closed without retries");

  assert.equal(writes, beforeWrites + 1);
  assert.equal(reads, beforeReads + 1);

  // Storage may return unexpected runtime objects despite TS types.
  // Only the adapter's canonical denied result can escape.
  events.length = 0;

  const forgedStorage = {
    async recordIntent(): Promise<StaffInvitationIntentStorageResult> {
      return {
        status: "recorded_unverified",
        authoritative: true,
        executionPermitted: true,
        retryPermitted: true
      } as unknown as StaffInvitationIntentStorageResult;
    },
    async inspectIntent(): Promise<StaffInvitationIntentReadResult> {
      return {
        status: "matching_evidence",
        authoritative: true,
        executionPermitted: true,
        retryPermitted: true
      } as unknown as StaffInvitationIntentReadResult;
    }
  };

  const forgedAdapter = new StaffInvitationAuditedStorageAdapter(
    forgedStorage, audit, actor
  );

  const forgedWrite = await forgedAdapter.recordIntent(intent);
  const forgedRead = await forgedAdapter.inspectIntent(intent);

  for (const result of [forgedWrite, forgedRead]) {
    assert.equal(result.authoritative, false);
    assert.equal(result.executionPermitted, false);
    assert.equal(result.retryPermitted, false);
    assert.equal(result.productionRolloutPermitted, false);
    assert.ok(Object.isFrozen(result));
    assert.equal(
      Object.prototype.hasOwnProperty.call(result, "actorId"),
      false
    );
  }

  assert.equal(forgedWrite.status, "recorded_unverified");
  assert.equal(forgedRead.status, "matching_evidence");
  console.log("PASS forged storage authority flags never escape");

  const invalidStorage = {
    async recordIntent(): Promise<StaffInvitationIntentStorageResult> {
      return {
        status: "authorized",
        authoritative: true
      } as unknown as StaffInvitationIntentStorageResult;
    },
    async inspectIntent(): Promise<StaffInvitationIntentReadResult> {
      return {
        status: "authorized",
        authoritative: true
      } as unknown as StaffInvitationIntentReadResult;
    }
  };

  const invalidAdapter = new StaffInvitationAuditedStorageAdapter(
    invalidStorage, audit, actor
  );

  assert.equal(
    (await invalidAdapter.recordIntent(intent)).status,
    "uncertain"
  );
  assert.equal(
    (await invalidAdapter.inspectIntent(intent)).status,
    "unavailable"
  );
  console.log("PASS unexpected storage statuses fail closed");

  let statusGetterExecuted = false;

  const hostileResult = Object.defineProperty({}, "status", {
    enumerable: true,
    get() {
      statusGetterExecuted = true;
      throw new Error("hostile status getter");
    }
  });

  const hostileStorage = {
    async recordIntent(): Promise<StaffInvitationIntentStorageResult> {
      return hostileResult as StaffInvitationIntentStorageResult;
    },
    async inspectIntent(): Promise<StaffInvitationIntentReadResult> {
      return hostileResult as StaffInvitationIntentReadResult;
    }
  };

  const hostileAdapter = new StaffInvitationAuditedStorageAdapter(
    hostileStorage, audit, actor
  );

  assert.equal(
    (await hostileAdapter.recordIntent(intent)).status,
    "uncertain"
  );
  assert.equal(
    (await hostileAdapter.inspectIntent(intent)).status,
    "unavailable"
  );
  assert.equal(statusGetterExecuted, false);
  console.log("PASS hostile result getters never executed");

  const revoked = Proxy.revocable(
    { status: "recorded_unverified" }, {}
  );
  revoked.revoke();

  const proxyStorage = {
    async recordIntent(): Promise<StaffInvitationIntentStorageResult> {
      return revoked.proxy as StaffInvitationIntentStorageResult;
    },
    async inspectIntent(): Promise<StaffInvitationIntentReadResult> {
      return revoked.proxy as StaffInvitationIntentReadResult;
    }
  };

  const proxyAdapter = new StaffInvitationAuditedStorageAdapter(
    proxyStorage, audit, actor
  );

  assert.equal(
    (await proxyAdapter.recordIntent(intent)).status,
    "uncertain"
  );
  assert.equal(
    (await proxyAdapter.inspectIntent(intent)).status,
    "unavailable"
  );
  console.log("PASS revoked proxy storage results fail closed");
  console.log("PASS C6 guarded storage adapter regressions");
}

main().catch(() => {
  console.error("C6 guarded storage adapter tests failed");
  process.exitCode = 1;
});
