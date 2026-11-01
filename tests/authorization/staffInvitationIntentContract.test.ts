import assert from "node:assert/strict";
import {
  STAFF_INVITATION_INTENT_SOURCE,
  compareStaffInvitationIntents,
  validateStaffInvitationIntent
} from "../../src/contracts/staffInvitationIntent.v1";

const valid = {
  schemaVersion: 1,
  sourceIdentity: STAFF_INVITATION_INTENT_SOURCE,
  operationId: "c4653c42-9c4b-4c4e-b214-647d42125120",
  actorId: "synthetic-admin",
  displayName: "Synthetic Staff",
  recipientEmail: "synthetic@example.org",
  createdAt: "2026-11-01T00:00:00.000Z"
};

function assertSafe(value: {
  authoritative: false;
  executionPermitted: false;
  retryPermitted: false;
  persisted: false;
}): void {
  assert.equal(value.authoritative, false);
  assert.equal(value.executionPermitted, false);
  assert.equal(value.retryPermitted, false);
  assert.equal(value.persisted, false);
}

function checkInvalid(
  name: string,
  input: unknown
): void {
  const outcome = validateStaffInvitationIntent(input);
  assert.notEqual(outcome.status, "valid", name);
  assert.equal(outcome.intent, undefined, name);
  assertSafe(outcome);
}

const accepted = validateStaffInvitationIntent(valid);
assert.equal(accepted.status, "valid");
assert.equal(accepted.diagnostic, "validated_not_persisted");
assertSafe(accepted);
assert.ok(accepted.intent);
assert.ok(Object.isFrozen(accepted));
assert.ok(Object.isFrozen(accepted.intent));
assert.notEqual(accepted.intent, valid);

const detached = validateStaffInvitationIntent({ ...valid });
assert.equal(detached.status, "valid");
assert.notEqual(detached.intent, accepted.intent);
assertSafe(detached);

checkInvalid("null", null);
checkInvalid("array", []);
checkInvalid("missing operation ID", {
  ...valid, operationId: ""
});
checkInvalid("malformed operation ID", {
  ...valid, operationId: "not-a-guid"
});
checkInvalid("nil UUID", {
  ...valid, operationId: "00000000-0000-0000-0000-000000000000"
});
checkInvalid("non-v4 UUID", {
  ...valid, operationId: "c4653c42-9c4b-1c4e-b214-647d42125120"
});
checkInvalid("invalid UUID variant", {
  ...valid, operationId: "c4653c42-9c4b-4c4e-7214-647d42125120"
});
checkInvalid("uppercase UUID", {
  ...valid, operationId: valid.operationId.toUpperCase()
});
checkInvalid("extra field", {
  ...valid, invocationAuthorized: true
});
checkInvalid("missing field", (() => {
  const { actorId: omitted, ...rest } = valid;
  assert.equal(omitted, "synthetic-admin");
  return rest;
})());
checkInvalid("blank actor", {
  ...valid, actorId: " "
});
checkInvalid("invalid email", {
  ...valid, recipientEmail: "not-an-email"
});
checkInvalid("invalid timestamp", {
  ...valid, createdAt: "2026-99-99T00:00:00.000Z"
});
checkInvalid("noncanonical timestamp", {
  ...valid, createdAt: "2026-11-01"
});
checkInvalid("unsupported version", {
  ...valid, schemaVersion: 2
});

const accessor: Record<string, unknown> = { ...valid };
Object.defineProperty(accessor, "actorId", {
  enumerable: true,
  get(): never {
    throw new Error("Getter must not execute");
  }
});
checkInvalid("getter", accessor);

const proxy = new Proxy({ ...valid }, {
  get(): never {
    throw new Error("Proxy must not be read");
  }
});
checkInvalid("proxy", proxy);

const matching = compareStaffInvitationIntents(
  valid,
  { ...valid }
);
assert.equal(matching.status, "matching");
assertSafe(matching);

const contradictory = compareStaffInvitationIntents(
  valid,
  { ...valid, recipientEmail: "different@example.org" }
);
assert.equal(contradictory.status, "contradictory");
assertSafe(contradictory);

const different = compareStaffInvitationIntents(
  valid,
  {
    ...valid,
    operationId: "e6e9523e-4109-4503-80bc-78225a5bc3cf"
  }
);
assert.equal(different.status, "different_operation");
assertSafe(different);

const invalidComparison = compareStaffInvitationIntents(
  valid,
  { ...valid, schemaVersion: 99 }
);
assert.equal(invalidComparison.status, "invalid_evidence");
assertSafe(invalidComparison);

console.log("Staff invitation intent v1 synthetic contract tests passed");
