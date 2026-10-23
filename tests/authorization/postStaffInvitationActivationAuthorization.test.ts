import assert from "node:assert/strict";
import {
  postStaffInvitationActivation,
  createPostStaffInvitationActivationHandler
} from "../../src/functions/postStaffInvitationActivation/index";
import {
  getEntraStaffActivationAuthorizationConfiguration
} from "../../src/config/entraStaffActivationAuthorization";

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

const syntheticToken = "aaaa.bbbb.cccc";
const validEnvironment: Record<string, string> = {
  FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION: "true",
  HOPE_ENTRA_TENANT_ID: tenantId,
  HOPE_ENTRA_API_AUDIENCE: "api://synthetic-backend",
  AUTH_MICROSOFT_ENTRA_ID_ID: "11111111-1111-4111-8111-111111111111",
  HOPE_ENTRA_REQUIRED_SCOPES: "Staff.Activate",
  HOPE_ENTRA_ALLOWED_CLIENT_APP_IDS:
    "22222222-2222-4222-8222-222222222222"
};

async function runEnforcementTests(): Promise<void> {
  let activations = 0;
  let verifications = 0;
  let verifiedIdentity = { tenantId, objectId };
  let verifyFails = false;

  const handler = (environment: Record<string, string>) =>
    createPostStaffInvitationActivationHandler({
      getAuthorizationConfiguration: () =>
        getEntraStaffActivationAuthorizationConfiguration(environment),
      verifyToken: async () => {
        verifications += 1;
        if (verifyFails) {
          throw new Error("synthetic verification failure");
        }
        return verifiedIdentity as any;
      },
      activate: async () => {
        activations += 1;
        return {
          accepted: true,
          staffId: "synthetic-staff",
          activated: true,
          eventId: "synthetic-event"
        } as any;
      }
    });

  async function call(
    environment: Record<string, string>,
    req: any
  ): Promise<TestResponse> {
    const context: any = {
      res: null,
      log: Object.assign(() => undefined, { error: () => undefined })
    };
    await handler(environment)(context, req);
    assert.ok(context.res);
    return context.res as TestResponse;
  }

  const key = { "x-api-key": "synthetic-test-key" };
  const bearer = { authorization: `Bearer ${syntheticToken}` };

  function assertRejected(result: TestResponse, status: number): void {
    assert.equal(result.status, status);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error, "Unauthorized");
    assert.equal(activations, 0);
    assert.ok(
      !JSON.stringify(result.body).includes(syntheticToken)
    );
  }

  // Disabled mode: no Bearer token required, service reached.
  {
    const result = await call({}, request(key));
    assert.equal(result.status, 200);
    assert.equal(verifications, 0);
    assert.equal(activations, 1);
    activations = 0;
  }

  // API key boundary runs first, even with a valid Bearer token.
  {
    const missing = await call(validEnvironment, request(bearer));
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error, "Missing x-api-key");

    const invalid = await call(
      validEnvironment,
      request({ ...bearer, "x-api-key": "wrong" })
    );
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error, "Invalid x-api-key");
    assert.equal(activations, 0);
    assert.equal(verifications, 0);
  }

  // Missing and malformed Bearer headers.
  const malformedHeaders: Record<string, string>[] = [
    {},
    { authorization: "" },
    { authorization: "Basic aaaa.bbbb.cccc" },
    { authorization: "Bearer" },
    { authorization: "Bearer not-a-jwt" },
    { authorization: `Bearer ${syntheticToken} extra` },
    { authorization: ` Bearer ${syntheticToken}` },
    { authorization: `Bearer ${syntheticToken}, Bearer ${syntheticToken}` }
  ];

  for (const headers of malformedHeaders) {
    assertRejected(
      await call(validEnvironment, request({ ...key, ...headers })),
      401
    );
  }
  assert.equal(verifications, 0);

  // Conflicting get() and direct-property values, and duplicate keys.
  {
    const conflicting = request({ ...key, ...bearer });
    conflicting.headers.authorization = "Bearer dddd.eeee.ffff";
    assertRejected(await call(validEnvironment, conflicting), 401);

    const duplicate = request({ ...key, ...bearer });
    duplicate.headers.Authorization = `Bearer ${syntheticToken}`;
    assertRejected(await call(validEnvironment, duplicate), 401);

    const nonString = request({ ...key });
    nonString.headers.authorization = [`Bearer ${syntheticToken}`];
    assertRejected(await call(validEnvironment, nonString), 401);
    assert.equal(verifications, 0);
  }

  // Invalid token.
  verifyFails = true;
  assertRejected(
    await call(validEnvironment, request({ ...key, ...bearer })),
    401
  );
  verifyFails = false;

  // Identity mismatch.
  verifiedIdentity = {
    tenantId,
    objectId: "33333333-3333-4333-8333-333333333333"
  };
  assertRejected(
    await call(validEnvironment, request({ ...key, ...bearer })),
    403
  );
  verifiedIdentity = { tenantId, objectId };

  // Malformed server configuration fails closed.
  {
    const result = await call(
      { ...validEnvironment, HOPE_ENTRA_API_AUDIENCE: "" },
      request({ ...key, ...bearer })
    );
    assert.equal(result.status, 500);
    assert.equal(result.body.ok, false);
    assert.equal(activations, 0);
  }

  // Matching verified identity reaches the stubbed service.
  {
    const result = await call(
      validEnvironment,
      request({ ...key, ...bearer })
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(activations, 1);
  }
}

async function run(): Promise<void> {
  const originalKey = process.env.HOPE_API_KEY;
  const originalFeature =
    process.env.FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION;

  delete process.env.FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION;

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

    await runEnforcementTests();

    console.log(
      "Staff invitation activation authorization tests passed"
    );
  } finally {
    if (originalFeature === undefined) {
      delete process.env.FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION;
    } else {
      process.env.FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION =
        originalFeature;
    }
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