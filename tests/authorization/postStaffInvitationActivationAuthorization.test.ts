import assert from "node:assert/strict";
import {
  postStaffInvitationActivation
} from "../../src/functions/postStaffInvitationActivation/index";

type TestResponse = {
  status: number;
  body: Record<string, any>;
};

const tenantId = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const objectId = "c1717a19-c719-4ed2-8b72-e013800095de";

function request(
  headers: Record<string, string>,
  ids: { tenantId: string; objectId: string } = {
    tenantId,
    objectId
  }
): any {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      value
    ])
  );

  return {
    headers: {
      ...normalized,
      get: (name: string) =>
        normalized[name.toLowerCase()] ?? null
    },
    params: {
      entraTenantId: ids.tenantId,
      entraObjectId: ids.objectId
    }
  };
}

async function invoke(req: any): Promise<TestResponse> {
  const context: any = {
    res: null,
    log: Object.assign(
      () => undefined,
      { error: () => undefined }
    )
  };

  await postStaffInvitationActivation(context, req);

  assert.ok(context.res, "Handler must produce a response");

  return context.res as TestResponse;
}

async function run(): Promise<void> {
  const originalKey = process.env.HOPE_API_KEY;

  try {
    process.env.HOPE_API_KEY = "synthetic-test-key";

    // A missing key must be rejected before staff activation.
    {
      const result = await invoke(request({}));

      assert.equal(result.status, 401);
      assert.equal(result.body.ok, false);
      assert.equal(result.body.error, "Missing x-api-key");
      assert.equal(
        result.body.authRejectedBy,
        "postStaffInvitationActivation"
      );
      assert.equal(typeof result.body.requestId, "string");
    }

    // An incorrect key must also be rejected.
    {
      const result = await invoke(request({
        "x-api-key": "incorrect-synthetic-key"
      }));

      assert.equal(result.status, 401);
      assert.equal(result.body.ok, false);
      assert.equal(result.body.error, "Invalid x-api-key");
      assert.equal(
        result.body.authRejectedBy,
        "postStaffInvitationActivation"
      );
    }

    // Missing server configuration must fail closed.
    {
      delete process.env.HOPE_API_KEY;

      const result = await invoke(request({
        "x-api-key": "synthetic-test-key"
      }));

      assert.equal(result.status, 500);
      assert.equal(result.body.ok, false);
      assert.equal(
        result.body.error,
        "Server missing HOPE_API_KEY"
      );
      assert.equal(
        result.body.authRejectedBy,
        "postStaffInvitationActivation"
      );
    }

    process.env.HOPE_API_KEY = "synthetic-test-key";

    // A valid key reaches the service, but malformed Entra
    // identifiers must be rejected before any repository access.
    {
      const result = await invoke(
        request(
          { "x-api-key": "synthetic-test-key" },
          {
            tenantId: "invalid-tenant-id",
            objectId: "invalid-object-id"
          }
        )
      );

      assert.equal(result.status, 400);
      assert.equal(result.body.ok, false);
      assert.equal(
        result.body.error,
        "entraTenantId and entraObjectId must be valid GUIDs"
      );
      assert.equal(
        result.body.authRejectedBy,
        undefined
      );
    }

    // Alternate accepted key header representation.
    // Still use invalid identifiers to prevent storage access.
    {
      const result = await invoke(
        request(
          { "x-functions-key": "synthetic-test-key" },
          {
            tenantId: "not-a-guid",
            objectId: "not-a-guid"
          }
        )
      );

      assert.equal(result.status, 400);
      assert.equal(result.body.ok, false);
    }

    console.log(
      "Staff invitation activation authorization tests passed"
    );
  } finally {
    if (originalKey === undefined) {
      delete process.env.HOPE_API_KEY;
    } else {
      process.env.HOPE_API_KEY = originalKey;
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});