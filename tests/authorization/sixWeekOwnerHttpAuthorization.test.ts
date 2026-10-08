import assert from "node:assert/strict";
import {
  postSixWeekVisitorFollowupOwner
} from "../../src/functions/postSixWeekVisitorFollowupOwner";

function context(): any {
  return {
    res: undefined,
    log: Object.assign(() => undefined, {
      error: () => undefined,
      warn: () => undefined,
      info: () => undefined
    })
  };
}

function request(
  headers: Record<string, string>,
  bodyActor = "untrusted-body-actor"
): any {
  return {
    headers,
    params: { visitorId: "visitor-owner-test" },
    body: {
      ownerStaffId: "staff-care",
      actorId: bodyActor
    }
  };
}

async function run(): Promise<void> {
  const previousApiKey = process.env.HOPE_API_KEY;
  process.env.HOPE_API_KEY = "local-test-key-only";

  try {
    let actorCalls = 0;
    let commandCalls = 0;
    let captured: any = null;

    const reset = (): void => {
      actorCalls = 0;
      commandCalls = 0;
      captured = null;
    };

    const validHeaders = {
      "x-api-key": "local-test-key-only",
      "x-hope-staff-actor-id": "staff-care"
    };

    const allowCareActor = async (): Promise<any> => {
      actorCalls++;
      return { ok: true, actorId: "staff-care" };
    };

    const rejectActor = async (
      status: number,
      error: string
    ): Promise<any> => {
      actorCalls++;
      return {
        ok: false,
        status,
        body: { ok: false, error }
      };
    };

    const assignSuccess = async (input: any): Promise<any> => {
      commandCalls++;
      captured = input;
      return {
        accepted: true,
        status: 202,
        created: true
      };
    };

    // 1. Invalid API key cannot reach actor resolver or command.
    {
      reset();
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(
        ctx,
        request({ "x-api-key": "wrong-key" }),
        {
          resolveActor: allowCareActor,
          assignOwner: assignSuccess
        }
      );

      assert.equal(ctx.res.status, 401);
      assert.equal(actorCalls, 0);
      assert.equal(commandCalls, 0);
    }

    // 2. Missing actor header results in 401 and no command call.
    {
      reset();
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(
        ctx,
        request({ "x-api-key": "local-test-key-only" }),
        {
          resolveActor: () =>
            rejectActor(401, "Missing x-hope-staff-actor-id"),
          assignOwner: assignSuccess
        }
      );

      assert.equal(ctx.res.status, 401);
      assert.equal(commandCalls, 0);
    }

    // 3. Unknown/inactive Staff actor results in 403.
    for (const scenario of ["unknown", "inactive"]) {
      reset();
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(
        ctx,
        request(validHeaders),
        {
          resolveActor: () =>
            rejectActor(403, `${scenario} Staff actor`),
          assignOwner: assignSuccess
        }
      );

      assert.equal(ctx.res.status, 403);
      assert.equal(commandCalls, 0);
    }

    // 4. Active Care Team self-claim uses the canonical header actor,
    //    not a mismatched body.actorId.
    {
      reset();
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(
        ctx,
        request(validHeaders, "staff-pastor"),
        {
          resolveActor: allowCareActor,
          assignOwner: assignSuccess
        }
      );

      assert.equal(ctx.res.status, 202);
      assert.equal(commandCalls, 1);
      assert.equal(captured.visitorId, "visitor-owner-test");
      assert.equal(captured.ownerStaffId, "staff-care");
      assert.equal(captured.actorId, "staff-care");
      assert.notEqual(captured.actorId, "staff-pastor");
      assert.equal(captured.administrativeOverrideVerified, undefined);
    }

    // 5. Verified administrator override reaches the command.
    {
      reset();
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(
        ctx,
        request({
          "x-api-key": "local-test-key-only",
          "x-admin-api-key": "synthetic-admin-key",
          "x-hope-admin-actor-id": "staff-admin"
        }),
        {
          resolveActor: async () => {
            actorCalls++;
            return {
              ok: true,
              actorId: "staff-admin",
              administrativeOverrideVerified: true
            };
          },
          assignOwner: assignSuccess
        }
      );

      assert.equal(ctx.res.status, 202);
      assert.equal(captured.actorId, "staff-admin");
      assert.equal(captured.administrativeOverrideVerified, true);
    }

    // 6. Rejected administrative override must never invoke command.
    {
      reset();
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(
        ctx,
        request(validHeaders),
        {
          resolveActor: () =>
            rejectActor(403, "Administrative override rejected"),
          assignOwner: assignSuccess
        }
      );

      assert.equal(ctx.res.status, 403);
      assert.equal(commandCalls, 0);
    }

    // 7. Command authorization rejection is passed through unchanged.
    {
      reset();
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(
        ctx,
        request(validHeaders),
        {
          resolveActor: allowCareActor,
          assignOwner: async (input: any) => {
            commandCalls++;
            captured = input;
            return {
              accepted: false,
              status: 403,
              error: "Only a verified ministry administrator may reassign a claimed follow-up plan"
            };
          }
        }
      );

      assert.equal(ctx.res.status, 403);
      assert.equal(ctx.res.body.ok, false);
      assert.equal(commandCalls, 1);
    }

    // 8. Command exception preserves the existing error contract.
    {
      reset();
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(
        ctx,
        request(validHeaders),
        {
          resolveActor: allowCareActor,
          assignOwner: async () => {
            commandCalls++;
            throw new Error("Synthetic persistence failure");
          }
        }
      );

      assert.equal(ctx.res.status, 500);
      assert.equal(ctx.res.body.ok, false);
      assert.equal(commandCalls, 1);
    }

    console.log("sixWeekOwnerHttpAuthorization.test.ts passed");
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
