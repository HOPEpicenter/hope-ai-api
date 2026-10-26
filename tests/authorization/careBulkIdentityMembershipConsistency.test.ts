import * as assert from "node:assert/strict";
import {
  assessCareBulkIdentityMembershipConsistency,
  type CareBulkIdentityMembershipConsistency
} from "../../src/services/authorization/careBulkIdentityMembershipConsistency";

function identity(
  operationId: unknown,
  correlationId: unknown = "trace-1"
): unknown {
  return { correlationId, operationId };
}

function membership(
  requestId: unknown = "operation-1",
  visitorIds: unknown = ["visitor-a", "visitor-b"]
): unknown {
  return {
    requestId,
    kind: "assign",
    assigneeId: "staff-a",
    visitorIds
  };
}

function safe(result: CareBulkIdentityMembershipConsistency): void {
  assert.equal(result.durableIdentityVerified, false);
  assert.equal(result.durableMembershipVerified, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
  assert.equal(Object.isFrozen(result), true);
}

function expectStatus(
  operation: unknown,
  members: unknown,
  status: CareBulkIdentityMembershipConsistency["status"]
): void {
  const output = assessCareBulkIdentityMembershipConsistency(
    operation,
    members
  );

  assert.equal(output.status, status);
  safe(output);
}

expectStatus(
  identity("operation-1"),
  membership(),
  "consistent_unverified_intent"
);

expectStatus(
  identity("operation-1", null),
  membership(),
  "consistent_unverified_intent"
);

expectStatus(
  identity("different-operation"),
  membership(),
  "identity_mismatch"
);

expectStatus(
  identity(null, "operation-1"),
  membership(),
  "missing_operation_identity"
);

console.log("[PASS] Matching, mismatched, and missing identities");

// A matching correlation ID must never replace missing operation ID.
expectStatus(
  identity(null, "operation-1"),
  membership("operation-1"),
  "missing_operation_identity"
);

// Invalid membership must not become consistent, even with matching IDs.
expectStatus(
  identity("operation-1"),
  membership("operation-1", ["visitor-a", "visitor-a"]),
  "invalid_input"
);

expectStatus(
  identity("operation-1"),
  membership("operation-1", []),
  "invalid_input"
);

expectStatus(
  identity("operation-1"),
  {
    requestId: "operation-1",
    kind: "unexpected",
    assigneeId: "staff-a",
    visitorIds: ["visitor-a", "visitor-b"]
  },
  "invalid_input"
);

expectStatus(
  identity("invalid/id"),
  membership(),
  "invalid_input"
);

expectStatus(
  identity("operation-1"),
  null,
  "invalid_input"
);

console.log("[PASS] Correlation and malformed membership fail closed");

const accessor = {
  correlationId: "trace",
  operationId: "operation-1"
};
Object.defineProperty(accessor, "operationId", {
  enumerable: true,
  get() { throw new Error("synthetic_accessor"); }
});

expectStatus(accessor, membership(), "invalid_input");

const revoked = Proxy.revocable({}, {});
revoked.revoke();
expectStatus(revoked.proxy, membership(), "invalid_input");

let reads = 0;
const changingIdentity = new Proxy({
  correlationId: null,
  operationId: "placeholder"
}, {
  getOwnPropertyDescriptor(target, key) {
    if (key === "operationId") {
      reads++;
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: reads === 1 ? "operation-1" : "different-operation"
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  }
});

expectStatus(
  changingIdentity,
  membership("operation-1"),
  "consistent_unverified_intent"
);
assert.equal(reads, 1);

console.log("[PASS] Hostile and stateful identity inputs handled");

for (let i = 0; i < 3; i++) {
  expectStatus(
    identity("operation-1", `trace-${i}`),
    membership(),
    "consistent_unverified_intent"
  );
}

console.log("[PASS] Repeated matches remain non-durable");
const unassignMembership = {
  requestId: "operation-1",
  kind: "unassign",
  assigneeId: null,
  visitorIds: ["visitor-a", "visitor-b"]
};

expectStatus(
  identity("operation-1"),
  unassignMembership,
  "consistent_unverified_intent"
);

expectStatus(
  identity("operation-2"),
  unassignMembership,
  "identity_mismatch"
);

expectStatus(
  identity(null),
  { ...unassignMembership, visitorIds: [] },
  "invalid_input"
);

expectStatus(
  identity("o".repeat(128), "c".repeat(128)),
  membership("o".repeat(128)),
  "consistent_unverified_intent"
);

expectStatus(
  identity("o".repeat(129)),
  membership("operation-1"),
  "invalid_input"
);

console.log("[PASS] Unassign, precedence, and identity bounds checked");

// The membership parser must read a caller-supplied request ID once.
let membershipReads = 0;
const changingMembership = new Proxy({
  requestId: "placeholder",
  kind: "assign",
  assigneeId: "staff-a",
  visitorIds: ["visitor-a"]
}, {
  getOwnPropertyDescriptor(target, key) {
    if (key === "requestId") {
      membershipReads++;
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: membershipReads === 1
          ? "operation-1"
          : "different-operation"
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  }
});

expectStatus(
  identity("operation-1"),
  changingMembership,
  "consistent_unverified_intent"
);
assert.equal(membershipReads, 1);

const hostileMembership = new Proxy({}, {
  ownKeys() { throw new Error("synthetic_membership_proxy"); }
});

expectStatus(
  identity("operation-1"),
  hostileMembership,
  "invalid_input"
);

console.log("[PASS] Membership snapshot and hostile input checked");

console.log("[PASS] Bulk Care identity/membership consistency tests passed");
