import assert from "node:assert/strict";
import {
  postSixWeekVisitorFollowup
} from "../../src/functions/postSixWeekVisitorFollowup";

type ActorResult =
  | { ok: true; actorId: string; administrativeOverrideVerified?: true }
  | { ok: false; status: number; body: Record<string, unknown> };

function makeContext(): any {
  return {
    res: undefined,
    log: Object.assign(() => undefined, {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined
    })
  };
}

function makeRequest(
  headers: Record<string, string>,
  actorId = "untrusted-body-actor"
): any {
  return {
    headers,
    params: { visitorId: "visitor-test" },
    body: {
      firstVisitDate: "2026-10-01",
      contactConsent: true,
      preferredContactMethod: "call",
      ownerStaffId: null,
      actorId
    }
  };
}

async function run(): Promise<void> {
  const previousApiKey = process.env.HOPE_API_KEY;
  process.env.HOPE_API_KEY = "local-test-key-only";

  try {
    let commandCalls = 0;
    let authCalls = 0;
    let capturedInput: any = null;

    const reset = (): void => {
      commandCalls = 0;
      authCalls = 0;
      capturedInput = null;
    };

    const authorizedActor = async (): Promise<ActorResult> => {
      authCalls++;
      return { ok: true, actorId: "staff-care-team" };
    };

    const rejectedActor = async (): Promise<ActorResult> => {
      authCalls++;
      return {
        ok: false,
        status: 403,
        body: { ok: false, error: "Inactive or unknown Staff identity" }
      };
    };

    const startSuccess = async (input: any): Promise<any> => {
      commandCalls++;
      capturedInput = input;
      return {
        accepted: true,
        status: 201,
        created: true
      };
    };

    const validHeaders = {
      "x-api-key": "local-test-key-only",
      "x-hope-staff-actor-id": "staff-care-team"
    };

    // 1. Invalid API key cannot bypass the HTTP API-key guard.
    {
      reset();
      const context = makeContext();
      const req = makeRequest({
        "x-api-key": "invalid-key",
        "x-hope-staff-actor-id": "staff-care-team"
      });

      await postSixWeekVisitorFollowup(context, req, {
        resolveActor: authorizedActor,
        startFollowup: startSuccess
      });

      assert.equal(context.res.status, 401);
      assert.equal(authCalls, 0);
      assert.equal(commandCalls, 0);
    }

    // 2. Missing Staff actor header is rejected.
    {
      reset();
      const context = makeContext();
      const req = makeRequest({ "x-api-key": "local-test-key-only" });

      await postSixWeekVisitorFollowup(context, req, {
        resolveActor: async () => {
          authCalls++;
          return {
            ok: false,
            status: 401,
            body: { ok: false, error: "Missing x-hope-staff-actor-id" }
          };
        },
        startFollowup: startSuccess
      });

      assert.equal(context.res.status, 401);
      assert.equal(commandCalls, 0);
    }

    // 3. Rejected Staff identity never reaches the command.
    {
      reset();
      const context = makeContext();

      await postSixWeekVisitorFollowup(
        context,
        makeRequest(validHeaders),
        {
          resolveActor: rejectedActor,
          startFollowup: startSuccess
        }
      );

      assert.equal(context.res.status, 403);
      assert.equal(commandCalls, 0);
    }

    // 4. Active Care Team actor can start a follow-up plan.
    //    The untrusted body.actorId must not override actor attribution.
    {
      reset();
      const context = makeContext();

      await postSixWeekVisitorFollowup(
        context,
        makeRequest(validHeaders, "staff-pastor"),
        {
          resolveActor: authorizedActor,
          startFollowup: startSuccess
        }
      );

      assert.equal(context.res.status, 201);
      assert.equal(commandCalls, 1);
      assert.equal(capturedInput.actorId, "staff-care-team");
      assert.notEqual(capturedInput.actorId, "staff-pastor");
      assert.equal(capturedInput.visitorId, "visitor-test");
      assert.equal(capturedInput.contactConsent, true);
    }

    // 5. Verified administrator actor is preserved.
    {
      reset();
      const context = makeContext();

      await postSixWeekVisitorFollowup(
        context,
        makeRequest(validHeaders, "staff-care-team"),
        {
          resolveActor: async () => {
            authCalls++;
            return {
              ok: true,
              actorId: "staff-admin",
              administrativeOverrideVerified: true
            };
          },
          startFollowup: startSuccess
        }
      );

      assert.equal(context.res.status, 201);
      assert.equal(capturedInput.actorId, "staff-admin");
    }

    // 6. Existing command-level validation remains authoritative.
    {
      reset();
      const context = makeContext();

      await postSixWeekVisitorFollowup(
        context,
        makeRequest(validHeaders),
        {
          resolveActor: authorizedActor,
          startFollowup: async (input: any): Promise<any> => {
            commandCalls++;
            capturedInput = input;
            return {
              accepted: false,
              status: 400,
              error: "contactConsent must be true before starting follow-up"
            };
          }
        }
      );

      assert.equal(context.res.status, 400);
      assert.equal(commandCalls, 1);
      assert.equal(context.res.body.ok, false);
    }

    // 7. A command exception produces the existing 500 response.
    {
      reset();
      const context = makeContext();

      await postSixWeekVisitorFollowup(
        context,
        makeRequest(validHeaders),
        {
          resolveActor: authorizedActor,
          startFollowup: async (): Promise<any> => {
            commandCalls++;
            throw new Error("Synthetic storage failure");
          }
        }
      );

      assert.equal(context.res.status, 500);
      assert.equal(commandCalls, 1);
      assert.equal(context.res.body.ok, false);
    }

    console.log("sixWeekStartHttpAuthorization.test.ts passed");
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.HOPE_API_KEY;
    } else {
      process.env.HOPE_API_KEY = previousApiKey;
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
