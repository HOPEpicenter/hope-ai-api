import * as assert from "node:assert/strict";
import {
  assessCareBulkOperationIdentity,
  type CareBulkOperationIdentityAssessment
} from "../../src/services/authorization/careBulkOperationIdentityBoundary";

function safe(result: CareBulkOperationIdentityAssessment): void {
  assert.equal(result.durableIdentityVerified, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
  assert.equal(Object.isFrozen(result), true);
}

const explicit = assessCareBulkOperationIdentity({
  correlationId: "trace-1",
  operationId: "operation-1"
});
assert.equal(explicit.status, "explicit_operation_identity_unverified");
assert.equal(explicit.correlationId, "trace-1");
assert.equal(explicit.operationId, "operation-1");
safe(explicit);

const withoutCorrelation = assessCareBulkOperationIdentity({
  correlationId: null,
  operationId: "operation-2"
});
assert.equal(
  withoutCorrelation.status,
  "explicit_operation_identity_unverified"
);
assert.equal(withoutCorrelation.correlationId, null);
safe(withoutCorrelation);

const absent = assessCareBulkOperationIdentity({
  correlationId: "operation-looking-trace",
  operationId: null
});
assert.equal(absent.status, "missing_operation_identity");
assert.equal(absent.operationId, null);
safe(absent);
console.log("[PASS] Correlation never substitutes for operation identity");

for (const input of [
  null, {}, [],
  { correlationId: "trace-1" },
  { correlationId: null, operationId: undefined },
  { correlationId: "", operationId: "operation-1" },
  { correlationId: "trace-1", operationId: "" },
  { correlationId: null, operationId: "operation/1" },
  { correlationId: null, operationId: " operation-1" },
  { correlationId: null, operationId: "x".repeat(129) },
  { correlationId: null, operationId: "operation-1", durable: true }
]) {
  const result = assessCareBulkOperationIdentity(input);
  assert.equal(result.status, "invalid_input");
  safe(result);
}
console.log("[PASS] Malformed and implicit identities rejected");

const accessor = {
  correlationId: null,
  operationId: "operation-1"
};
Object.defineProperty(accessor, "operationId", {
  enumerable: true,
  get() { throw new Error("synthetic_accessor"); }
});

const throwingProxy = new Proxy({}, {
  ownKeys() { throw new Error("synthetic_proxy"); }
});

const revoked = Proxy.revocable({}, {});
revoked.revoke();

for (const input of [accessor, throwingProxy, revoked.proxy]) {
  const result = assessCareBulkOperationIdentity(input);
  assert.equal(result.status, "invalid_input");
  safe(result);
}
console.log("[PASS] Hostile inputs fail closed");

const repeated = assessCareBulkOperationIdentity({
  correlationId: "trace-2",
  operationId: "operation-1"
});
assert.equal(
  repeated.status,
  "explicit_operation_identity_unverified"
);
safe(repeated);
console.log("[PASS] Repeated caller IDs never establish durable replay");
const minId = assessCareBulkOperationIdentity({
  correlationId: "c",
  operationId: "o"
});
assert.equal(minId.status, "explicit_operation_identity_unverified");
safe(minId);

const maxId = assessCareBulkOperationIdentity({
  correlationId: "c".repeat(128),
  operationId: "o".repeat(128)
});
assert.equal(maxId.status, "explicit_operation_identity_unverified");
safe(maxId);

const noIds = assessCareBulkOperationIdentity({
  correlationId: null,
  operationId: null
});
assert.equal(noIds.status, "missing_operation_identity");
safe(noIds);

const inherited = Object.create({
  operationId: "inherited-operation"
});
inherited.correlationId = "trace";
assert.equal(
  assessCareBulkOperationIdentity(inherited).status,
  "invalid_input"
);

const symbolic = {
  correlationId: null,
  operationId: "operation-1",
  [Symbol("hidden")]: true
};
assert.equal(
  assessCareBulkOperationIdentity(symbolic).status,
  "invalid_input"
);
console.log("[PASS] Identity bounds and inherited properties checked");

// A stateful Proxy must not turn a first-read invalid value
// into accepted operation identity on a later descriptor read.
let operationReads = 0;
const changingInvalid = new Proxy({
  correlationId: "trace-1",
  operationId: "placeholder"
}, {
  getOwnPropertyDescriptor(target, key) {
    if (key === "operationId") {
      operationReads++;
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: operationReads === 1 ? "invalid/id" : "operation-1"
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  }
});

const changingInvalidResult =
  assessCareBulkOperationIdentity(changingInvalid);

assert.equal(changingInvalidResult.status, "invalid_input");
assert.equal(operationReads, 1);
safe(changingInvalidResult);

// The first valid descriptor is snapshotted exactly once, but
// remains unverified and incapable of authorizing any action.
let validReads = 0;
const changingValid = new Proxy({
  correlationId: "trace-2",
  operationId: "placeholder"
}, {
  getOwnPropertyDescriptor(target, key) {
    if (key === "operationId") {
      validReads++;
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: validReads === 1 ? "operation-first" : "operation-later"
      };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  }
});

const changingValidResult =
  assessCareBulkOperationIdentity(changingValid);

assert.equal(
  changingValidResult.status,
  "explicit_operation_identity_unverified"
);
assert.equal(changingValidResult.operationId, "operation-first");
assert.equal(validReads, 1);
safe(changingValidResult);
console.log("[PASS] Stateful proxy identity is read only once");

console.log("[PASS] Bulk Care operation identity boundary tests passed");
