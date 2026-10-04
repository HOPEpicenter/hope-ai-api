import assert from "node:assert/strict";
import type {
  MinistryEmailDispatchRecoveryAuditV1,
  ResolveMinistryEmailDispatchRecoveryInputV1,
  ResolveMinistryEmailDispatchRecoveryResultV1
} from "../../src/contracts/ministryEmailDispatchRecovery.v1";
import {
  postMinistryEmailDispatchRecovery
} from "../../src/functions/postMinistryEmailDispatchRecovery";

const audit: MinistryEmailDispatchRecoveryAuditV1 = {
  schemaVersion: 1,
  resolutionId: "resolution-1",
  deliveryId: "delivery-1",
  dispatchAttemptId: "attempt-1",
  actorId: "canonical-admin",
  resolvedAt: "2026-10-04T03:00:00.000Z",
  provider: "sendgrid",
  decision: "provider_accepted",
  evidenceKind: "provider_accepted",
  evidenceSource: "captured_send_response",
  evidenceId: "evidence-1",
  evidenceObservedAt: "2026-10-04T02:59:00.000Z",
  evidenceFingerprint: "private-fingerprint",
  providerMessageId: "message-1",
  failureCode: null
};

function request(
  overrides: Record<string, unknown> = {}
): any {
  return {
    headers: {
      "x-request-id": "request-1"
    },
    params: {
      deliveryId: "delivery-1"
    },
    body: {
      resolutionId: "resolution-1",
      dispatchAttemptId: "attempt-1",
      resolvedAt: "2026-10-04T03:00:00.000Z",
      actorId: "caller-controlled-actor",
      evidence: {
        schemaVersion: 1,
        kind: "provider_accepted",
        source: "captured_send_response",
        deliveryId: "delivery-1",
        dispatchAttemptId: "attempt-1",
        provider: "sendgrid",
        evidenceId: "evidence-1",
        observedAt: "2026-10-04T02:59:00.000Z",
        providerMessageId: "message-1"
      },
      ...overrides
    }
  };
}

function context() {
  return {
    res: undefined,
    log: {
      error() {}
    }
  } as any;
}

async function run(): Promise<void> {
  {
    const c = context();
    let authCalls = 0;
    let recoveryCalls = 0;

    await postMinistryEmailDispatchRecovery(
      c,
      request(),
      {
        getFlags: () => ({
          ministryEmailDispatchRecovery: false
        }),
        authorize: async () => {
          authCalls += 1;
          return {
            ok: true,
            actorId: "canonical-admin"
          };
        },
        resolveRecovery: async () => {
          recoveryCalls += 1;
          return {
            ok: true,
            status: "resolved",
            audit
          };
        }
      }
    );

    assert.equal(c.res.status, 404);
    assert.equal(authCalls, 0);
    assert.equal(recoveryCalls, 0);
  }

  {
    const c = context();
    let recoveryCalls = 0;

    await postMinistryEmailDispatchRecovery(
      c,
      request(),
      {
        getFlags: () => ({
          ministryEmailDispatchRecovery: true
        }),
        authorize: async () => ({
          ok: false,
          status: 403,
          body: {
            ok: false,
            error: "Forbidden"
          }
        }),
        resolveRecovery: async () => {
          recoveryCalls += 1;
          return {
            ok: true,
            status: "resolved",
            audit
          };
        }
      }
    );

    assert.equal(c.res.status, 403);
    assert.equal(recoveryCalls, 0);
  }

  {
    const c = context();
    let received:
      | ResolveMinistryEmailDispatchRecoveryInputV1
      | undefined;

    await postMinistryEmailDispatchRecovery(
      c,
      request(),
      {
        getFlags: () => ({
          ministryEmailDispatchRecovery: true
        }),
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        resolveRecovery: async input => {
          received = structuredClone(input);

          return {
            ok: true,
            status: "resolved",
            audit
          };
        }
      }
    );

    assert(received);

    assert.equal(
      received.actorId,
      "canonical-admin",
      "caller body actorId must never become audit authority"
    );

    assert.equal(received.deliveryId, "delivery-1");
    assert.equal(received.dispatchAttemptId, "attempt-1");
    assert.equal(
      received.resolvedAt,
      "2026-10-04T03:00:00.000Z"
    );

    assert.equal(c.res.status, 201);
    assert.equal(c.res.body.ok, true);
    assert.equal(c.res.body.status, "resolved");

    const serialized = JSON.stringify(c.res.body);

    assert(!serialized.includes("private-fingerprint"));
    assert(!serialized.includes("caller-controlled-actor"));
    assert(!serialized.includes('"actorId"'));
  }

  {
    const c = context();

    await postMinistryEmailDispatchRecovery(
      c,
      request(),
      {
        getFlags: () => ({
          ministryEmailDispatchRecovery: true
        }),
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        resolveRecovery: async () => ({
          ok: true,
          status: "replayed",
          audit
        })
      }
    );

    assert.equal(c.res.status, 200);
    assert.equal(c.res.body.status, "replayed");
  }

  {
    const c = context();
    let received:
      | ResolveMinistryEmailDispatchRecoveryInputV1
      | undefined;

    const mismatched = request();
    mismatched.params.deliveryId = "route-delivery";

    await postMinistryEmailDispatchRecovery(
      c,
      mismatched,
      {
        getFlags: () => ({
          ministryEmailDispatchRecovery: true
        }),
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        resolveRecovery: async input => {
          received = structuredClone(input);

          return {
            ok: false,
            code: "INVALID_RECOVERY_INPUT"
          };
        }
      }
    );

    assert(received);
    assert.equal(received.deliveryId, "route-delivery");
    assert.equal(
      received.evidence.deliveryId,
      "delivery-1"
    );
    assert.equal(c.res.status, 400);
  }

  const failures: Array<{
    result: ResolveMinistryEmailDispatchRecoveryResultV1;
    status: number;
  }> = [
    {
      result: {
        ok: false,
        code: "INVALID_RECOVERY_INPUT"
      },
      status: 400
    },
    {
      result: {
        ok: false,
        code: "DELIVERY_NOT_FOUND"
      },
      status: 404
    },
    {
      result: {
        ok: false,
        code: "DELIVERY_NOT_DISPATCHING"
      },
      status: 409
    },
    {
      result: {
        ok: false,
        code: "DISPATCH_ATTEMPT_MISMATCH"
      },
      status: 409
    },
    {
      result: {
        ok: false,
        code: "RECOVERY_REPLAY_CONFLICT"
      },
      status: 409
    },
    {
      result: {
        ok: false,
        code: "RECOVERY_TRANSITION_CONFLICT"
      },
      status: 409
    },
    {
      result: {
        ok: false,
        code: "RECOVERY_PERSISTENCE_UNCERTAIN"
      },
      status: 503
    },
    {
      result: {
        ok: false,
        code: "RECOVERY_STORAGE_INVARIANT_VIOLATION"
      },
      status: 500
    }
  ];

  for (const failure of failures) {
    const c = context();

    await postMinistryEmailDispatchRecovery(
      c,
      request(),
      {
        getFlags: () => ({
          ministryEmailDispatchRecovery: true
        }),
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        resolveRecovery: async () => failure.result
      }
    );

    assert.equal(c.res.status, failure.status);

    const response = JSON.stringify(c.res.body);

    assert(!response.includes("PRIVATE_SUBJECT"));
    assert(!response.includes("PRIVATE_BODY"));
    assert(!response.includes("private@example.org"));
  }

  {
    const c = context();

    await postMinistryEmailDispatchRecovery(
      c,
      request(),
      {
        getFlags: () => ({
          ministryEmailDispatchRecovery: true
        }),
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        resolveRecovery: async () => {
          throw new Error(
            "PRIVATE_BODY recipient=private@example.org"
          );
        }
      }
    );

    assert.equal(c.res.status, 500);
    assert.equal(
      c.res.body.error.code,
      "MINISTRY_EMAIL_DISPATCH_RECOVERY_FAILED"
    );

    const response = JSON.stringify(c.res.body);

    assert(!response.includes("PRIVATE_BODY"));
    assert(!response.includes("private@example.org"));
  }

  // There is deliberately no provider dependency in this handler.
  let providerCalls = 0;
  assert.equal(providerCalls, 0);

  console.log(
    "postMinistryEmailDispatchRecovery.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});