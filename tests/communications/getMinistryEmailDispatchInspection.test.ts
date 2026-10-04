import assert from "node:assert/strict";
import type {
  MinistryEmailDispatchInspectionV1,
  ReadMinistryEmailDispatchInspectionResultV1
} from "../../src/contracts/ministryEmailDispatchInspection.v1";
import {
  getMinistryEmailDispatchInspection
} from "../../src/functions/getMinistryEmailDispatchInspection";

const inspection: MinistryEmailDispatchInspectionV1 = {
  deliveryId: "delivery-1",
  state: "dispatching",
  inspectedAt: "2026-10-03T20:00:00.000Z",
  requestedAt: "2026-10-03T19:00:00.000Z",
  dispatchAttemptId: "attempt-1",
  dispatchClaimedAt: "2026-10-03T19:01:00.000Z",
  claimAgeSeconds: 3540,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  assessment: "execution_unresolved",
  reconciliationRequired: true,
  resendAuthorized: false
};

function context() {
  const errors: string[] = [];

  return {
    value: {
      log: {
        error(value: string) {
          errors.push(value);
        }
      }
    } as any,
    errors
  };
}

function request(
  deliveryId: string | undefined
) {
  return {
    headers: {
      "x-request-id": "request-1"
    },
    params: deliveryId === undefined
      ? {}
      : { deliveryId }
  };
}

function validRequest() {
  return request("delivery-1");
}

async function run(): Promise<void> {
  {
    const c = context();
    let reads = 0;

    await getMinistryEmailDispatchInspection(
      c.value,
      validRequest(),
      {
        authorize: async () => ({
          ok: false,
          status: 401,
          body: {
            ok: false,
            error: "Unauthorized"
          }
        }),
        readInspection: async () => {
          reads += 1;
          return {
            ok: true,
            inspection
          };
        }
      }
    );

    assert.equal(c.value.res.status, 401);
    assert.equal(c.value.res.body.requestId, "request-1");
    assert.equal(reads, 0);
  }

  {
    const c = context();
    let reads = 0;

    await getMinistryEmailDispatchInspection(
      c.value,
      request(undefined),
      {
        authorize: async () => ({
          ok: true,
          actorId: "admin-1"
        }),
        readInspection: async () => {
          reads += 1;
          return {
            ok: true,
            inspection
          };
        }
      }
    );

    assert.equal(c.value.res.status, 400);
    assert.equal(
      c.value.res.body.error.code,
      "INVALID_INSPECTION_INPUT"
    );
    assert.equal(reads, 0);
  }

  {
    const c = context();
    let reads = 0;

    await getMinistryEmailDispatchInspection(
      c.value,
      validRequest(),
      {
        authorize: async () => ({
          ok: true,
          actorId: "admin-1"
        }),
        readInspection: async deliveryId => {
          reads += 1;
          assert.equal(deliveryId, "delivery-1");

          return {
            ok: true,
            inspection
          };
        }
      }
    );

    assert.equal(c.value.res.status, 200);
    assert.equal(c.value.res.body.ok, true);
    assert.equal(c.value.res.body.requestId, "request-1");
    assert.deepEqual(
      c.value.res.body.inspection,
      inspection
    );
    assert.equal(
      c.value.res.body.inspection.resendAuthorized,
      false
    );
    assert.equal(reads, 1);

    const serialized = JSON.stringify(c.value.res.body.inspection);

    for (const forbidden of [
      "recipientEmail",
      "subject",
      "body",
      "visitorId",
      "requestedBy",
      "eligibility",
      "failureCode"
    ]) {
      assert(
        !serialized.includes(`"${forbidden}"`)
      );
    }
  }

  const failures: Array<{
    result: ReadMinistryEmailDispatchInspectionResultV1;
    status: number;
    code: string;
  }> = [
    {
      result: {
        ok: false,
        code: "INVALID_INSPECTION_INPUT"
      },
      status: 400,
      code: "INVALID_INSPECTION_INPUT"
    },
    {
      result: {
        ok: false,
        code: "DELIVERY_NOT_FOUND"
      },
      status: 404,
      code: "DELIVERY_NOT_FOUND"
    },
    {
      result: {
        ok: false,
        code: "DELIVERY_INSPECTION_UNAVAILABLE"
      },
      status: 503,
      code: "DELIVERY_INSPECTION_UNAVAILABLE"
    },
    {
      result: {
        ok: false,
        code: "INVALID_DELIVERY_RECORD"
      },
      status: 500,
      code: "INVALID_DELIVERY_RECORD"
    }
  ];

  for (const failure of failures) {
    const c = context();

    await getMinistryEmailDispatchInspection(
      c.value,
      validRequest(),
      {
        authorize: async () => ({
          ok: true,
          actorId: "admin-1"
        }),
        readInspection: async () => failure.result
      }
    );

    assert.equal(c.value.res.status, failure.status);
    assert.equal(
      c.value.res.body.error.code,
      failure.code
    );
  }

  {
    const c = context();

    await getMinistryEmailDispatchInspection(
      c.value,
      validRequest(),
      {
        authorize: async () => ({
          ok: true,
          actorId: "admin-1"
        }),
        readInspection: async () => {
          throw new Error(
            "PRIVATE_BODY recipient=private@example.org"
          );
        }
      }
    );

    assert.equal(c.value.res.status, 500);
    assert.equal(
      c.value.res.body.error.code,
      "GET_MINISTRY_EMAIL_DISPATCH_INSPECTION_FAILED"
    );

    const response = JSON.stringify(c.value.res);

    assert(!response.includes("PRIVATE_BODY"));
    assert(!response.includes("private@example.org"));
  }

  console.log(
    "getMinistryEmailDispatchInspection.test.ts passed"
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});