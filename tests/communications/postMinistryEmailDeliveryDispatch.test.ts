import assert from "node:assert/strict";
import type {
  MinistryEmailDispatchResult,
  MinistryEmailDispatchStatus
} from "../../src/services/communications/dispatchMinistryEmailDelivery";
import {
  postMinistryEmailDeliveryDispatch
} from "../../src/functions/postMinistryEmailDeliveryDispatch";

function result(
  status: MinistryEmailDispatchStatus,
  reconciliationRequired = false
): MinistryEmailDispatchResult {
  return {
    deliveryId: "delivery-1",
    status,
    reconciliationRequired
  };
}

function context() {
  const errors: string[] = [];
  const infos: string[] = [];

  return {
    value: {
      res: undefined,
      log: {
        error(value: string) {
          errors.push(value);
        },
        info(value: string) {
          infos.push(value);
        }
      }
    } as any,
    errors,
    infos
  };
}

function request(
  deliveryId?: string
): any {
  const resolvedDeliveryId =
    arguments.length === 0
      ? "delivery-1"
      : deliveryId;

  return {
    headers: {
      "x-request-id": "request-1"
    },
    params:
      resolvedDeliveryId === undefined
        ? {}
        : {
            deliveryId: resolvedDeliveryId
          },
    body: {
      deliveryId: "caller-controlled-delivery",
      actorId: "caller-controlled-actor",
      provider: "resend",
      retry: true
    }
  };
}

async function run(): Promise<void> {
  {
    const c = context();
    let dispatchCalls = 0;

    await postMinistryEmailDeliveryDispatch(
      c.value,
      request(),
      {
        authorize: async () => ({
          ok: false,
          status: 401,
          body: {
            ok: false,
            error: "Unauthorized"
          }
        }),
        dispatch: async () => {
          dispatchCalls += 1;
          return result("provider_accepted");
        }
      }
    );

    assert.equal(c.value.res.status, 401);
    assert.equal(dispatchCalls, 0);
  }

  {
    const c = context();
    let dispatchCalls = 0;

    await postMinistryEmailDeliveryDispatch(
      c.value,
      request(undefined),
      {
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        dispatch: async () => {
          dispatchCalls += 1;
          return result("provider_accepted");
        }
      }
    );

    assert.equal(c.value.res.status, 400);
    assert.equal(
      c.value.res.body.error.code,
      "INVALID_MINISTRY_EMAIL_DISPATCH_INPUT"
    );
    assert.equal(dispatchCalls, 0);
  }

  {
    const c = context();
    let received: string | undefined;

    await postMinistryEmailDeliveryDispatch(
      c.value,
      request("route-delivery"),
      {
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        dispatch: async deliveryId => {
          received = deliveryId;

          return {
            deliveryId,
            status: "provider_accepted",
            reconciliationRequired: false
          };
        }
      }
    );

    assert.equal(received, "route-delivery");
    assert.equal(c.value.res.status, 200);
    assert.equal(c.value.res.body.ok, true);
    assert.equal(
      c.value.res.body.dispatch.status,
      "provider_accepted"
    );

    const serialized =
      JSON.stringify(c.value.res);

    assert(
      !serialized.includes(
        "caller-controlled-delivery"
      )
    );

    assert(
      !serialized.includes(
        "caller-controlled-actor"
      )
    );

    assert.equal(
      c.infos.length,
      1
    );

    const audit =
      JSON.parse(
        c.infos[0]
      );

    assert.equal(
      audit.operation,
      "postMinistryEmailDeliveryDispatch"
    );

    assert.equal(
      audit.action,
      "dispatch_requested"
    );

    assert.equal(
      audit.actorId,
      "canonical-admin"
    );

    assert.equal(
      audit.deliveryId,
      "route-delivery"
    );

    assert.equal(
      audit.requestId,
      "request-1"
    );

    const auditSerialized =
      JSON.stringify(audit);

    assert(
      !auditSerialized.includes(
        "caller-controlled-actor"
      )
    );

    assert(
      !auditSerialized.includes(
        "caller-controlled-delivery"
      )
    );
  }

  for (
    const status of [
      "provider_accepted",
      "provider_failed",
      "already_terminal"
    ] as const
  ) {
    const c = context();

    await postMinistryEmailDeliveryDispatch(
      c.value,
      request(),
      {
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        dispatch: async () =>
          result(status)
      }
    );

    assert.equal(
      c.value.res.status,
      200,
      status
    );

    assert.equal(
      c.value.res.body.ok,
      true,
      status
    );
  }

  const failures: Array<{
    value: MinistryEmailDispatchResult;
    status: number;
    code: string;
  }> = [
    {
      value: result("phase5_disabled"),
      status: 404,
      code: "MINISTRY_EMAIL_DISPATCH_DISABLED"
    },
    {
      value: result("provider_sending_disabled"),
      status: 404,
      code: "MINISTRY_EMAIL_DISPATCH_DISABLED"
    },
    {
      value: result("provider_unavailable"),
      status: 503,
      code: "MINISTRY_EMAIL_PROVIDER_UNAVAILABLE"
    },
    {
      value: result("delivery_not_found"),
      status: 404,
      code: "MINISTRY_EMAIL_DELIVERY_NOT_FOUND"
    },
    {
      value: result("recipient_not_allowed"),
      status: 409,
      code: "MINISTRY_EMAIL_RECIPIENT_NOT_ALLOWED"
    },
    {
      value: result("delivery_read_failed"),
      status: 503,
      code: "MINISTRY_EMAIL_DELIVERY_READ_UNAVAILABLE"
    },
    {
      value: result(
        "already_dispatching_reconciliation_required",
        true
      ),
      status: 409,
      code: "MINISTRY_EMAIL_RECONCILIATION_REQUIRED"
    },
    {
      value: result("claim_conflict"),
      status: 409,
      code: "MINISTRY_EMAIL_DISPATCH_CLAIM_CONFLICT"
    },
    {
      value: result(
        "claim_persistence_uncertain",
        true
      ),
      status: 503,
      code: "MINISTRY_EMAIL_DISPATCH_CLAIM_UNCERTAIN"
    },
    {
      value: result(
        "provider_execution_uncertain",
        true
      ),
      status: 503,
      code: "MINISTRY_EMAIL_PROVIDER_EXECUTION_UNCERTAIN"
    },
    {
      value: result(
        "provider_result_persistence_conflict",
        true
      ),
      status: 409,
      code: "MINISTRY_EMAIL_PROVIDER_RESULT_CONFLICT"
    },
    {
      value: result(
        "provider_result_persistence_uncertain",
        true
      ),
      status: 503,
      code: "MINISTRY_EMAIL_PROVIDER_RESULT_UNCERTAIN"
    }
  ];

  for (const failure of failures) {
    const c = context();

    await postMinistryEmailDeliveryDispatch(
      c.value,
      request(),
      {
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        dispatch: async () =>
          failure.value
      }
    );

    assert.equal(
      c.value.res.status,
      failure.status,
      failure.value.status
    );

    assert.equal(
      c.value.res.body.error.code,
      failure.code,
      failure.value.status
    );

    assert.deepEqual(
      c.value.res.body.dispatch,
      failure.value
    );
  }

  {
    const c = context();

    await postMinistryEmailDeliveryDispatch(
      c.value,
      request(),
      {
        authorize: async () => ({
          ok: true,
          actorId: "canonical-admin"
        }),
        dispatch: async () => {
          throw new Error(
            "PRIVATE_BODY recipient=private@example.org"
          );
        }
      }
    );

    assert.equal(c.value.res.status, 500);

    assert.equal(
      c.value.res.body.error.code,
      "MINISTRY_EMAIL_DISPATCH_FAILED"
    );

    const serialized =
      JSON.stringify(c.value.res);

    assert(!serialized.includes("PRIVATE_BODY"));
    assert(!serialized.includes("private@example.org"));
  }

  console.log(
    "postMinistryEmailDeliveryDispatch.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});