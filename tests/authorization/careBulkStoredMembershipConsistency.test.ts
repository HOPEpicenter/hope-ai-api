import * as assert from "node:assert/strict";
import type {
  CareBulkMembershipStorageRepository,
  CareBulkStoredMembershipComparison
} from "../../src/repositories/careBulkMembershipStorageRepository";
import {
  assessCareBulkStoredMembershipConsistency
} from "../../src/services/authorization/careBulkStoredMembershipConsistency";

type Reader = Pick<
  CareBulkMembershipStorageRepository,
  "compareStoredIntent"
>;

function identity(operationId: string | null) {
  return { correlationId: "trace-1", operationId };
}

function membership() {
  return {
    requestId: "operation-1",
    kind: "assign",
    assigneeId: "staff-a",
    visitorIds: ["visitor-a", "visitor-b"]
  };
}

function storageResult(
  status: CareBulkStoredMembershipComparison["status"]
): CareBulkStoredMembershipComparison {
  return {
    status,
    durableMembershipVerified: false,
    authorizationPermitted: false,
    executionPermitted: false,
    retryPermitted: false,
    automaticRecoveryPermitted: false,
    productionRolloutPermitted: false
  };
}

function safe(result: Awaited<
  ReturnType<typeof assessCareBulkStoredMembershipConsistency>
>): void {
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.durableIdentityVerified, false);
  assert.equal(result.durableMembershipVerified, false);
  assert.equal(result.writerParticipationVerified, false);
  assert.equal(result.assignmentExecutionVerified, false);
  assert.equal(result.historicalCompletenessVerified, false);
  assert.equal(result.authorizationPermitted, false);
  assert.equal(result.executionPermitted, false);
  assert.equal(result.retryPermitted, false);
  assert.equal(result.automaticRecoveryPermitted, false);
  assert.equal(result.productionRolloutPermitted, false);
  assert.equal(Object.isFrozen(result), true);
}

async function main(): Promise<void> {
  let reads = 0;
  const reader = {
    async compareStoredIntent() {
      reads++;
      return storageResult("matching_evidence");
    }
  } as Reader;

  const matching = await assessCareBulkStoredMembershipConsistency(
    identity("operation-1"), membership(), reader
  );
  assert.equal(matching.status, "matching_stored_evidence_unverified");
  assert.equal(reads, 1);
  safe(matching);

  const mismatch = await assessCareBulkStoredMembershipConsistency(
    identity("different-operation"), membership(), reader
  );
  assert.equal(mismatch.status, "identity_mismatch");
  assert.equal(reads, 1);
  safe(mismatch);

  const missing = await assessCareBulkStoredMembershipConsistency(
    identity(null), membership(), reader
  );
  assert.equal(missing.status, "missing_operation_identity");
  assert.equal(reads, 1);
  safe(missing);

  const invalid = await assessCareBulkStoredMembershipConsistency(
    { correlationId: null, operationId: "invalid/id" },
    membership(), reader
  );
  assert.equal(invalid.status, "invalid_input");
  assert.equal(reads, 1);
  safe(invalid);

  console.log("[PASS] Identity and missing-input gates avoid storage");

  for (const [storage, expected] of [
    ["conflict", "stored_membership_conflict"],
    ["uncertain", "storage_uncertain"],
    ["invalid_input", "invalid_input"]
  ] as const) {
    const result = await assessCareBulkStoredMembershipConsistency(
      identity("operation-1"),
      membership(),
      {
        async compareStoredIntent() {
          return storageResult(storage);
        }
      } as Reader
    );
    assert.equal(result.status, expected);
    safe(result);
  }

  const failure = await assessCareBulkStoredMembershipConsistency(
    identity("operation-1"),
    membership(),
    {
      async compareStoredIntent(): Promise<never> {
        throw new Error("synthetic_storage_failure");
      }
    } as Reader
  );
  assert.equal(failure.status, "storage_uncertain");
  safe(failure);

  console.log("[PASS] Conflicts, uncertainties and exceptions fail closed");

  let memberReads = 0;
  let storedReads = 0;
  const sourceMembership = membership();

  const changing = new Proxy(sourceMembership, {
    getOwnPropertyDescriptor(target, property) {
      if (property === "visitorIds") {
        memberReads++;
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: memberReads === 1
            ? ["visitor-a", "visitor-b"]
            : ["visitor-b"]
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, property);
    }
  });

  const snapshot = await assessCareBulkStoredMembershipConsistency(
    identity("operation-1"),
    changing,
    {
      async compareStoredIntent(expectedInput: unknown) {
        storedReads++;
        const expected = expectedInput as ReturnType<typeof membership>;
        assert.deepEqual(expected.visitorIds, ["visitor-a", "visitor-b"]);
        assert.equal(Object.isFrozen(expectedInput), true);
        assert.equal(Object.isFrozen(expected.visitorIds), true);
        return storageResult("matching_evidence");
      }
    } as Reader
  );

  assert.equal(memberReads, 1);
  assert.equal(storedReads, 1);
  assert.equal(snapshot.status, "matching_stored_evidence_unverified");
  safe(snapshot);

  console.log("[PASS] Stateful membership captured exactly once");

  const accessor = membership();
  Object.defineProperty(accessor, "visitorIds", {
    enumerable: true,
    get() { throw new Error("synthetic_accessor"); }
  });

  const hostile = await assessCareBulkStoredMembershipConsistency(
    identity("operation-1"), accessor, reader
  );

  assert.equal(hostile.status, "invalid_input");
  assert.equal(reads, 1);
  safe(hostile);

  const revoked = Proxy.revocable(membership(), {});
  revoked.revoke();

  const revokedResult = await assessCareBulkStoredMembershipConsistency(
    identity("operation-1"), revoked.proxy, reader
  );

  assert.equal(revokedResult.status, "invalid_input");
  assert.equal(reads, 1);
  safe(revokedResult);

  console.log("[PASS] Hostile and revoked membership rejected");
  let malformedReads = 0;

  for (const malformed of [
    null,
    undefined,
    {},
    { status: "unexpected_success" },
    { status: true }
  ]) {
    const result = await assessCareBulkStoredMembershipConsistency(
      identity("operation-1"),
      membership(),
      {
        async compareStoredIntent() {
          malformedReads++;
          return malformed as CareBulkStoredMembershipComparison;
        }
      } as Reader
    );

    assert.equal(result.status, "storage_uncertain");
    safe(result);
  }

  assert.equal(malformedReads, 5);

  const accessorResult = Object.defineProperty({}, "status", {
    enumerable: true,
    get() {
      throw new Error("synthetic_reader_status_accessor");
    }
  });

  const accessorResponse = await assessCareBulkStoredMembershipConsistency(
    identity("operation-1"),
    membership(),
    {
      async compareStoredIntent() {
        return accessorResult as CareBulkStoredMembershipComparison;
      }
    } as Reader
  );

  assert.equal(accessorResponse.status, "storage_uncertain");
  safe(accessorResponse);

  const rejected = await assessCareBulkStoredMembershipConsistency(
    identity("operation-1"),
    membership(),
    {
      async compareStoredIntent() {
        return Promise.reject(new Error("synthetic_rejected_read"));
      }
    } as Reader
  );

  assert.equal(rejected.status, "storage_uncertain");
  safe(rejected);

  console.log("[PASS] Malformed reader evidence fails closed");
  const forgedEvidence = [
    {
      ...storageResult("matching_evidence"),
      durableMembershipVerified: true
    },
    {
      ...storageResult("matching_evidence"),
      authorizationPermitted: true
    },
    {
      ...storageResult("matching_evidence"),
      unexpected: "extra"
    },
    {
      ...storageResult("matching_evidence"),
      retryPermitted: "false"
    }
  ];

  for (const evidence of forgedEvidence) {
    const result = await assessCareBulkStoredMembershipConsistency(
      identity("operation-1"),
      membership(),
      {
        async compareStoredIntent() {
          return evidence as CareBulkStoredMembershipComparison;
        }
      } as Reader
    );
    assert.equal(result.status, "storage_uncertain");
    safe(result);
  }

  const accessorEvidence = storageResult("matching_evidence");
  Object.defineProperty(accessorEvidence, "status", {
    configurable: true,
    enumerable: true,
    get() { return "matching_evidence"; }
  });

  const accessorEvidenceResult =
    await assessCareBulkStoredMembershipConsistency(
      identity("operation-1"),
      membership(),
      {
        async compareStoredIntent() {
          return accessorEvidence;
        }
      } as Reader
    );

  assert.equal(accessorEvidenceResult.status, "storage_uncertain");
  safe(accessorEvidenceResult);

  let statusReads = 0;
  const changingEvidence = new Proxy(
    storageResult("matching_evidence"),
    {
      getOwnPropertyDescriptor(target, key) {
        if (key === "status") {
          statusReads++;
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: statusReads === 1
              ? "matching_evidence"
              : "conflict"
          };
        }
        return Reflect.getOwnPropertyDescriptor(target, key);
      }
    }
  );

  const capturedEvidence = await assessCareBulkStoredMembershipConsistency(
    identity("operation-1"),
    membership(),
    {
      async compareStoredIntent() {
        return changingEvidence;
      }
    } as Reader
  );

  assert.equal(statusReads, 1);
  assert.equal(
    capturedEvidence.status,
    "matching_stored_evidence_unverified"
  );
  safe(capturedEvidence);

  console.log("[PASS] Forged and stateful reader evidence checked");
  console.log("[PASS] All stored-membership consistency proofs passed");
}

main().catch(error => {
  console.error("[FAIL]", error.message);
  process.exitCode = 1;
});
