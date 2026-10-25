import assert from "node:assert/strict";
import {
  compareCareBulkMembershipIntent,
  parseCareBulkMembershipIntent
} from "../../src/services/authorization/careBulkRequestMembershipContract";

function assign(
  requestId = "request-1",
  visitorIds: unknown = ["visitor-a", "visitor-b"],
  assigneeId: unknown = "staff-a"
): unknown {
  return { requestId, kind: "assign", assigneeId, visitorIds };
}

function unassign(
  requestId = "request-2",
  visitorIds: unknown = ["visitor-a", "visitor-b"]
): unknown {
  return { requestId, kind: "unassign", assigneeId: null, visitorIds };
}

function assertParseNeverAuthorizes(input: unknown): void {
  const result = parseCareBulkMembershipIntent(input);

  assert.equal(result.durable, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}

function assertComparisonNeverAuthorizes(
  original: unknown,
  candidate: unknown
): void {
  const result = compareCareBulkMembershipIntent(original, candidate);

  assert.equal(result.durableReplayVerified, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
}

function run(): void {
  const originalMembers = ["visitor-a", "visitor-b"];
  const original = assign("request-1", originalMembers);

  const parsed = parseCareBulkMembershipIntent(original);

  assert.equal(parsed.status, "valid_unpersisted_intent");
  assert.ok(parsed.intent);
  assert.equal(parsed.intent.requestId, "request-1");
  assert.equal(parsed.intent.kind, "assign");
  assert.equal(parsed.intent.assigneeId, "staff-a");
  assert.deepEqual(parsed.intent.visitorIds, [
    "visitor-a",
    "visitor-b"
  ]);

  assert.equal(Object.isFrozen(parsed.intent), true);
  assert.equal(Object.isFrozen(parsed.intent.visitorIds), true);

  originalMembers[0] = "visitor-changed";

  assert.deepEqual(parsed.intent.visitorIds, [
    "visitor-a",
    "visitor-b"
  ]);

  assertParseNeverAuthorizes(original);

  const parsedUnassign = parseCareBulkMembershipIntent(unassign());

  assert.equal(parsedUnassign.status, "valid_unpersisted_intent");
  assert.ok(parsedUnassign.intent);
  assert.equal(parsedUnassign.intent.kind, "unassign");
  assert.equal(parsedUnassign.intent.assigneeId, null);
  assertParseNeverAuthorizes(unassign());

  const sameA = assign("same-request");
  const sameB = assign("same-request", [
    "visitor-a",
    "visitor-b"
  ]);

  assert.equal(
    compareCareBulkMembershipIntent(sameA, sameB).status,
    "same_intent_not_durable"
  );
  assertComparisonNeverAuthorizes(sameA, sameB);

  const conflicts = [
    assign("different-request"),
    assign("same-request", ["visitor-b", "visitor-a"]),
    assign("same-request", ["visitor-a"]),
    assign("same-request", ["visitor-a", "visitor-c"]),
    assign("same-request", ["visitor-a", "visitor-b"], "staff-b"),
    unassign("same-request")
  ];

  for (const conflict of conflicts) {
    assert.equal(
      compareCareBulkMembershipIntent(sameA, conflict).status,
      "conflict"
    );
    assertComparisonNeverAuthorizes(sameA, conflict);
  }

  const sparseVisitors = new Array(1);

  const invalidCases: unknown[] = [
    null,
    undefined,
    {},
    [],
    assign("", ["visitor-a"]),
    assign("request/a", ["visitor-a"]),
    assign("request-1", []),
    assign("request-1", ["visitor-a", "visitor-a"]),
    assign("request-1", [" visitor-a"]),
    assign("request-1", ["visitor/a"]),
    assign("request-1", sparseVisitors),
    assign("request-1", ["visitor-a"], null),
    assign("request-1", ["visitor-a"], ""),
    unassign("request-2", ["visitor-a", "visitor-a"]),
    {
      requestId: "request-1",
      kind: "unassign",
      assigneeId: "staff-a",
      visitorIds: ["visitor-a"]
    },
    {
      requestId: "request-1",
      kind: "unexpected",
      assigneeId: null,
      visitorIds: ["visitor-a"]
    },
    {
      requestId: "request-1",
      kind: "assign",
      assigneeId: "staff-a",
      visitorIds: ["visitor-a"],
      complete: true
    },
    assign(
      "request-1",
      Array.from({ length: 1001 }, (_, i) => `visitor-${i}`)
    )
  ];

  for (const invalid of invalidCases) {
    const result = parseCareBulkMembershipIntent(invalid);

    assert.equal(result.status, "invalid_input");
    assert.equal(result.intent, null);
    assertParseNeverAuthorizes(invalid);

    assert.equal(
      compareCareBulkMembershipIntent(sameA, invalid).status,
      "invalid_input"
    );
    assertComparisonNeverAuthorizes(sameA, invalid);
  }

  const accessor = Object.defineProperty({}, "requestId", {
    get() {
      throw new Error("Hostile accessor");
    },
    enumerable: true
  });

  const hostileProxy = new Proxy({}, {
    ownKeys() {
      throw new Error("Hostile reflection");
    }
  });

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();

  for (const hostile of [accessor, hostileProxy, revoked.proxy]) {
    const result = parseCareBulkMembershipIntent(hostile);

    assert.equal(result.status, "invalid_input");
    assert.equal(result.intent, null);
    assertParseNeverAuthorizes(hostile);
    assertComparisonNeverAuthorizes(sameA, hostile);
  }

  console.log(
    "Care bulk request membership contract tests passed."
  );
}

run();
