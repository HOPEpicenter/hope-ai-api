import assert from "node:assert/strict";
import type { TransactionAction } from "@azure/data-tables";
import {
  coordinateStaffLifecycleEvent
} from "../../src/services/staff/coordinateStaffLifecycleEvent";
import type {
  StaffScopedAtomicPort
} from "../../src/repositories/staffScopedAtomicDeactivation";
import type {
  StaffReactivationAuthorizationPort
} from "../../src/repositories/staffScopedAtomicReactivation";

const staffId = "synthetic-coordinator-staff";
const time = "2026-11-09T12:00:00.000Z";

function event(
  type: string = "staff.updated",
  data: Record<string, unknown> = { displayName: "Synthetic Staff" },
  eventId = "synthetic-coordinator-event"
) {
  return {
    eventId,
    staffId,
    type,
    occurredAt: time,
    actorId: "synthetic-admin",
    data
  };
}

function fixture(
  state: string = "active",
  submit?: (actions: TransactionAction[]) => Promise<unknown>,
  missingHead = false
) {
  let reads = 0;
  const transactions: TransactionAction[][] = [];
  const port: StaffScopedAtomicPort = {
    async getEntity(partitionKey, rowKey) {
      reads++;
      return missingHead ? null : {
        partitionKey,
        rowKey,
        revision: 3,
        authorizationRevision: 3,
        state,
        etag: 'W/"synthetic-coordinator-etag"'
      };
    },
    async submitTransaction(actions) {
      transactions.push(actions);
      return submit ? submit(actions) : [];
    }
  };
  return {
    port,
    transactions,
    get reads() { return reads; }
  };
}

function authorizationPort(
  calls: Array<Record<string, unknown>>
): StaffReactivationAuthorizationPort {
  return {
    async authorizeReactivation(input) {
      calls.push(input);
      return {
        authorized: true,
        ...input
      };
    }
  };
}

async function main(): Promise<void> {
  {
    const f = fixture();
    const result = await coordinateStaffLifecycleEvent(
      event(), { storage: f.port }
    );
    assert.equal(result.status, "denied");
    assert.equal(result.operation, "disabled");
    assert.equal(result.legacyFallbackPermitted, false);
    assert.equal(f.reads, 0);
    assert.equal(f.transactions.length, 0);
    console.log("[PASS] Default-disabled coordinator performs no storage access");
  }

  {
    const f = fixture();
    const result = await coordinateStaffLifecycleEvent(
      event(), { storage: f.port }, { enabled: true }
    );
    assert.equal(result.status, "committed");
    assert.equal(result.operation, "profile_update");
    assert.equal(result.executionPermitted, false);
    assert.equal(result.legacyFallbackPermitted, false);
    assert.deepEqual(f.transactions[0].map(action => action[0]), [
      "update", "create", "create"
    ]);
    console.log("[PASS] Profile update routes through atomic mutation");
  }

  {
    const f = fixture("pending");
    const result = await coordinateStaffLifecycleEvent(
      event("staff.activated", { status: "active" }),
      { storage: f.port },
      { enabled: true, activationTransition: "pending" }
    );
    assert.equal(result.status, "committed");
    assert.equal(result.operation, "pending_activation");
    assert.equal(
      (f.transactions[0][0][1] as Record<string, unknown>).state,
      "active"
    );
  }

  {
    const f = fixture("active");
    const result = await coordinateStaffLifecycleEvent(
      event("staff.deactivated", { status: "inactive" }),
      { storage: f.port },
      { enabled: true }
    );
    assert.equal(result.status, "committed");
    assert.equal(result.operation, "deactivation");
    assert.equal(
      (f.transactions[0][0][1] as Record<string, unknown>).state,
      "revoked"
    );
  }

  {
    const f = fixture("revoked");
    const authorizations: Array<Record<string, unknown>> = [];
    const result = await coordinateStaffLifecycleEvent(
      event("staff.activated", { status: "active" }, "synthetic-reactivation"),
      {
        storage: f.port,
        reactivationAuthorization: authorizationPort(authorizations)
      },
      { enabled: true, activationTransition: "reactivation" }
    );
    assert.equal(result.status, "committed");
    assert.equal(result.operation, "reactivation");
    assert.deepEqual(authorizations, [{
      staffId,
      eventId: "synthetic-reactivation",
      actorId: "synthetic-admin",
      authorizationRevision: 3
    }]);
  }

  for (const [operation, input, options] of [
    ["creation", event("staff.created", {
      displayName: "Synthetic Staff",
      status: "active",
      entraTenantId: "11111111-1111-4111-8111-111111111111",
      entraObjectId: "22222222-2222-4222-8222-222222222222"
    }), { enabled: true }],
    ["invitation", event("staff.invited", {
      displayName: "Synthetic Staff",
      status: "pending"
    }), { enabled: true }],
    ["binding change", event("staff.updated", {
      entraTenantId: "11111111-1111-4111-8111-111111111111",
      entraObjectId: "22222222-2222-4222-8222-222222222222"
    }), { enabled: true }],
    ["status shortcut", event("staff.updated", { status: "active" }), {
      enabled: true
    }],
    ["activation without transition", event("staff.activated", {
      status: "active"
    }), { enabled: true }],
    ["reactivation without trusted port", event("staff.activated", {
      status: "active"
    }), { enabled: true, activationTransition: "reactivation" }]
  ] as const) {
    const f = fixture();
    const result = await coordinateStaffLifecycleEvent(
      input,
      { storage: f.port },
      options
    );
    assert.equal(result.status, "denied", operation);
    assert.equal(result.operation, "unsupported", operation);
    assert.equal(result.legacyFallbackPermitted, false, operation);
    assert.equal(f.reads, 0, operation);
    assert.equal(f.transactions.length, 0, operation);
  }
  console.log("[PASS] Unsupported creation, invitation, binding, and transitions blocked");

  {
    const f = fixture("revoked");
    const callerAssertion = {
      ...event("staff.activated", { status: "active" }),
      authorization: {
        authorized: true,
        staffId,
        eventId: "synthetic-coordinator-event",
        actorId: "synthetic-admin",
        authorizationRevision: 3
      }
    };
    const result = await coordinateStaffLifecycleEvent(
      callerAssertion,
      { storage: f.port },
      { enabled: true, activationTransition: "reactivation" }
    );
    assert.equal(result.status, "denied");
    assert.equal(f.reads, 0);
    assert.equal(f.transactions.length, 0);
  }
  console.log("[PASS] Caller-supplied reactivation assertions are not trusted");

  for (const [label, failure, expected] of [
    ["conditional conflict", { statusCode: 412 }, "denied"],
    ["uncertain transaction", new Error("synthetic transport uncertainty"),
      "uncertain"]
  ] as const) {
    const f = fixture("active", async () => { throw failure; });
    const result = await coordinateStaffLifecycleEvent(
      event(
        "staff.updated",
        { displayName: "Synthetic Change" },
        `synthetic-${label.replace(/\s+/g, "-")}`
      ),
      { storage: f.port },
      { enabled: true }
    );
    assert.equal(result.status, expected);
    assert.equal(result.legacyFallbackPermitted, false);
    assert.equal(f.transactions.length, 1);
  }
  console.log("[PASS] Conflicts and uncertain outcomes never fall back");

  {
    const f = fixture("revoked");
    const result = await coordinateStaffLifecycleEvent(
      event(),
      { storage: f.port },
      { enabled: true }
    );
    assert.equal(result.status, "denied");
    assert.equal(result.operation, "profile_update");
    assert.equal(f.transactions.length, 0);
  }

  {
    const f = fixture("active", undefined, true);
    const result = await coordinateStaffLifecycleEvent(
      event(),
      { storage: f.port },
      { enabled: true }
    );
    assert.equal(result.status, "denied");
    assert.equal(f.transactions.length, 0);
  }

  {
    const f = fixture();
    const deniedAuthorization: StaffReactivationAuthorizationPort = {
      async authorizeReactivation() {
        return { authorized: true };
      }
    };
    const result = await coordinateStaffLifecycleEvent(
      event("staff.activated", { status: "active" }),
      { storage: f.port, reactivationAuthorization: deniedAuthorization },
      { enabled: true, activationTransition: "reactivation" }
    );
    assert.equal(result.status, "denied");
    assert.equal(f.transactions.length, 0);
  }

  console.log("[PASS] Staff lifecycle coordinator regressions");
}

main().catch(() => {
  console.error("[FAIL] Staff lifecycle coordinator regression");
  process.exitCode = 1;
});
