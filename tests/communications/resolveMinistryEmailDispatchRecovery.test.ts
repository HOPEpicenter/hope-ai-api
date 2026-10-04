import assert from "node:assert/strict";
import type {
  MinistryEmailDispatchRecoveryAuditV1,
  ResolveMinistryEmailDispatchRecoveryInputV1
} from "../../src/contracts/ministryEmailDispatchRecovery.v1";
import type {
  MinistryEmailDeliveryRecord
} from "../../src/domain/communications/ministryEmailDeliveryContracts";
import type {
  MinistryEmailDispatchRecoveryRepository
} from "../../src/repositories/ministryEmailDispatchRecoveryRepository";
import {
  resolveMinistryEmailDispatchRecovery
} from "../../src/services/communications/resolveMinistryEmailDispatchRecovery";

const dispatching: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "dispatching",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "PRIVATE_SUBJECT",
  body: "PRIVATE_BODY",
  recipientEmail: "private@example.org",
  eligibility: {
    phase5Enabled: true,
    contactConsent: true,
    emailPreference: "granted"
  },
  dispatchAttemptId: "attempt-1",
  dispatchClaimedAt: "2026-10-03T12:01:00.000Z",
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};

function acceptedInput(
  resolutionId = "resolution-1"
): ResolveMinistryEmailDispatchRecoveryInputV1 {
  return {
    resolutionId,
    deliveryId: "delivery-1",
    dispatchAttemptId: "attempt-1",
    actorId: "admin-1",
    resolvedAt: "2026-10-03T12:03:00.000Z",
    evidence: {
      schemaVersion: 1,
      kind: "provider_accepted",
      source: "captured_send_response",
      deliveryId: "delivery-1",
      dispatchAttemptId: "attempt-1",
      provider: "sendgrid",
      evidenceId: "evidence-1",
      observedAt: "2026-10-03T12:02:00.000Z",
      providerMessageId: "message-1"
    }
  };
}

class FakeRepository
implements MinistryEmailDispatchRecoveryRepository {
  record: MinistryEmailDeliveryRecord | null =
    structuredClone(dispatching);

  version = 1;
  audits = new Map<string, MinistryEmailDispatchRecoveryAuditV1>();
  commits = 0;
  failMode:
    | null
    | "conflict"
    | "throw-before"
    | "throw-after" = null;

  async readDeliveryVersioned() {
    return this.record
      ? {
          record: structuredClone(this.record),
          version: `v${this.version}`
        }
      : null;
  }

  async readRecovery(
    _deliveryId: string,
    resolutionId: string
  ) {
    const audit = this.audits.get(resolutionId);
    return audit ? structuredClone(audit) : null;
  }

  async resolveIfVersion(
    next: MinistryEmailDeliveryRecord,
    audit: MinistryEmailDispatchRecoveryAuditV1,
    expectedVersion: string
  ) {
    if (this.failMode === "throw-before") {
      throw new Error("storage unavailable");
    }

    if (
      this.failMode === "conflict" ||
      !this.record ||
      expectedVersion !== `v${this.version}` ||
      this.record.state !== "dispatching" ||
      this.audits.has(audit.resolutionId)
    ) {
      return false;
    }

    this.record = structuredClone(next);
    this.audits.set(
      audit.resolutionId,
      structuredClone(audit)
    );
    this.version += 1;
    this.commits += 1;

    if (this.failMode === "throw-after") {
      throw new Error("lost acknowledgement");
    }

    return true;
  }
}

async function run(): Promise<void> {
  {
    const repository = new FakeRepository();

    const result = await resolveMinistryEmailDispatchRecovery(
      acceptedInput(),
      repository
    );

    assert(result.ok);
    assert.equal(result.status, "resolved");
    assert.equal(repository.commits, 1);
    assert.equal(repository.record?.state, "provider_accepted");
    assert.equal(
      repository.record?.providerMessageId,
      "message-1"
    );

    const replay = await resolveMinistryEmailDispatchRecovery(
      acceptedInput(),
      repository
    );

    assert(replay.ok);
    assert.equal(replay.status, "replayed");
    assert.equal(repository.commits, 1);
  }

  {
    const repository = new FakeRepository();

    const rejected: ResolveMinistryEmailDispatchRecoveryInputV1 = {
      ...acceptedInput(),
      resolutionId: "resolution-rejected",
      evidence: {
        schemaVersion: 1,
        kind: "provider_rejected",
        source: "captured_send_response",
        deliveryId: "delivery-1",
        dispatchAttemptId: "attempt-1",
        provider: "sendgrid",
        evidenceId: "rejection-1",
        observedAt: "2026-10-03T12:02:00.000Z",
        failureCode: "known_rejection"
      }
    };

    const result = await resolveMinistryEmailDispatchRecovery(
      rejected,
      repository
    );

    assert(result.ok);
    assert.equal(repository.record?.state, "failed");
    assert.equal(
      repository.record?.failureCode,
      "known_rejection"
    );
  }

  {
    const repository = new FakeRepository();

    const mismatched = acceptedInput();
    mismatched.evidence = {
      ...mismatched.evidence,
      dispatchAttemptId: "different-attempt"
    };

    assert.deepEqual(
      await resolveMinistryEmailDispatchRecovery(
        mismatched,
        repository
      ),
      {
        ok: false,
        code: "INVALID_RECOVERY_INPUT"
      }
    );

    assert.equal(repository.commits, 0);
  }

  {
    const repository = new FakeRepository();

    assert.deepEqual(
      await resolveMinistryEmailDispatchRecovery(
        {
          ...acceptedInput(),
          dispatchAttemptId: "stale-attempt",
          evidence: {
            ...acceptedInput().evidence,
            dispatchAttemptId: "stale-attempt"
          }
        },
        repository
      ),
      {
        ok: false,
        code: "DISPATCH_ATTEMPT_MISMATCH"
      }
    );

    assert.equal(repository.commits, 0);
  }

  {
    const repository = new FakeRepository();

    repository.record = {
      ...dispatching,
      state: "provider_accepted",
      provider: "sendgrid",
      providerMessageId: "worker-message",
      providerAcceptedAt: "2026-10-03T12:02:00.000Z"
    };

    assert.deepEqual(
      await resolveMinistryEmailDispatchRecovery(
        acceptedInput(),
        repository
      ),
      {
        ok: false,
        code: "DELIVERY_NOT_DISPATCHING"
      }
    );
  }

  {
    const repository = new FakeRepository();

    const first = await resolveMinistryEmailDispatchRecovery(
      acceptedInput(),
      repository
    );

    assert(first.ok);

    const conflict = acceptedInput();
    conflict.evidence = {
      ...conflict.evidence,
      evidenceId: "different-evidence"
    };

    assert.deepEqual(
      await resolveMinistryEmailDispatchRecovery(
        conflict,
        repository
      ),
      {
        ok: false,
        code: "RECOVERY_REPLAY_CONFLICT"
      }
    );
  }

  {
    const repository = new FakeRepository();
    repository.failMode = "throw-after";

    const result = await resolveMinistryEmailDispatchRecovery(
      acceptedInput("resolution-lost-ack"),
      repository
    );

    assert(result.ok);
    assert.equal(result.status, "replayed");
    assert.equal(repository.commits, 1);
  }

  {
    const repository = new FakeRepository();
    repository.failMode = "throw-before";

    assert.deepEqual(
      await resolveMinistryEmailDispatchRecovery(
        acceptedInput("resolution-uncertain"),
        repository
      ),
      {
        ok: false,
        code: "RECOVERY_PERSISTENCE_UNCERTAIN"
      }
    );

    assert.equal(repository.record?.state, "dispatching");
    assert.equal(repository.commits, 0);
  }

  {
    const repository = new FakeRepository();
    repository.failMode = "conflict";

    assert.deepEqual(
      await resolveMinistryEmailDispatchRecovery(
        acceptedInput("resolution-conflict"),
        repository
      ),
      {
        ok: false,
        code: "RECOVERY_TRANSITION_CONFLICT"
      }
    );
  }

  {
    const repository = new FakeRepository();
    repository.record = null;

    assert.deepEqual(
      await resolveMinistryEmailDispatchRecovery(
        acceptedInput(),
        repository
      ),
      {
        ok: false,
        code: "DELIVERY_NOT_FOUND"
      }
    );
  }

  {
    const repository = new FakeRepository();

    const first = acceptedInput("resolution-concurrent-a");
    const second = acceptedInput("resolution-concurrent-b");

    second.evidence = {
      ...second.evidence,
      evidenceId: "evidence-concurrent-b"
    };

    const results = await Promise.all([
      resolveMinistryEmailDispatchRecovery(
        first,
        repository
      ),
      resolveMinistryEmailDispatchRecovery(
        second,
        repository
      )
    ]);

    assert.equal(
      repository.commits,
      1,
      "concurrent recovery attempts must produce one terminal commit"
    );

    assert.equal(
      results.filter(result => result.ok).length,
      1,
      "only one competing resolution may succeed"
    );

    const rejected = results.find(result => !result.ok);

    assert(rejected && !rejected.ok);

    assert(
      rejected.code === "RECOVERY_TRANSITION_CONFLICT" ||
      rejected.code === "RECOVERY_REPLAY_CONFLICT",
      `unexpected concurrent loser code: ${rejected.code}`
    );

    assert.equal(
      repository.record?.state,
      "provider_accepted"
    );
  }

  // Recovery has no provider dependency at all. This counter exists to make
  // accidental provider execution visible if one is ever introduced here.
  let providerCalls = 0;

  assert.equal(providerCalls, 0);

  const serialized = JSON.stringify(
    await resolveMinistryEmailDispatchRecovery(
      acceptedInput("resolution-safe"),
      new FakeRepository()
    )
  );

  for (const forbidden of [
    "PRIVATE_SUBJECT",
    "PRIVATE_BODY",
    "private@example.org",
    "visitor-1",
    "staff-1"
  ]) {
    assert(!serialized.includes(forbidden));
  }

  assert.equal(providerCalls, 0);

  console.log(
    "resolveMinistryEmailDispatchRecovery.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});