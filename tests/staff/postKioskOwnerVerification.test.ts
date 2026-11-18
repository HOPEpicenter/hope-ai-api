import assert from "node:assert/strict";
import {
  createKioskOwnerVerificationHandler
} from "../../src/functions/postKioskOwnerVerification";

const original = { ...process.env };

async function main(): Promise<void> {
  let calls = 0;

  const handler = createKioskOwnerVerificationHandler({
    verify: async () => {
      calls++;
      return {
        verified: true,
        status: "OWNER_TOKEN_VERIFIED_EXECUTION_DISABLED",
        executionPermitted: false,
        staffCreationPermitted: false,
        authorizationGranted: false,
        approvalConsumptionPermitted: false
      };
    }
  });

  const request = {
    method: "POST",
    headers: new Map([
      ["x-api-key", "synthetic-key"],
      ["authorization", "Bearer aaa.bbb.ccc"]
    ])
  };

  // Map implements get(), matching the HTTP header reader.
  const execute = async () => {
    const context: any = {};
    await handler(context, request);
    return context.res;
  };

  try {
    process.env.WEBSITE_SITE_NAME = "hope-kiosk-acceptance-api";
    process.env.HOPE_API_KEY = "synthetic-key";
    delete process.env.HOPE_KIOSK_OWNER_VERIFICATION_ENABLED;

    const disabled = await execute();
    assert.equal(disabled.status, 404);
    assert.equal(calls, 0);

    process.env.HOPE_KIOSK_OWNER_VERIFICATION_ENABLED = "true";
    delete process.env.HOPE_KIOSK_OWNER_OBJECT_ID;

    const unconfigured = await execute();
    assert.equal(unconfigured.status, 401);
    assert.equal(calls, 0);

    process.env.HOPE_KIOSK_OWNER_OBJECT_ID =
      "22222222-2222-4222-8222-222222222222";
    process.env.HOPE_ENTRA_TENANT_ID =
      "11111111-1111-4111-8111-111111111111";
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID =
      "33333333-3333-4333-8333-333333333333";
    process.env.HOPE_ENTRA_API_AUDIENCE = "api://synthetic-backend";
    process.env.HOPE_ENTRA_REQUIRED_SCOPES = "Owner.Verify";

    const verified = await execute();
    assert.equal(verified.status, 200);
    assert.equal(verified.body.verified, true);
    assert.equal(verified.body.staffCreationPermitted, false);
    assert.equal(verified.body.authorizationGranted, false);
    assert.equal(calls, 1);

    // Azure Functions may provide plain-object headers.
    const objectRequest: any = {
      method: "POST",
      headers: {
        "x-api-key": "synthetic-key",
        authorization: "Bearer aaa.bbb.ccc"
      }
    };

    const executeObject = async () => {
      const context: any = {};
      await handler(context, objectRequest);
      return context.res;
    };

    const plainObject = await executeObject();
    assert.equal(plainObject.status, 200);
    assert.equal(plainObject.body.verified, true);
    assert.equal(plainObject.body.staffCreationPermitted, false);
    assert.equal(plainObject.body.authorizationGranted, false);
    assert.equal(calls, 2);

    delete objectRequest.headers.authorization;
    objectRequest.headers.Authorization = "Bearer aaa.bbb.ccc";

    const capitalizedHeader = await executeObject();
    assert.equal(capitalizedHeader.status, 200);
    assert.equal(capitalizedHeader.body.staffCreationPermitted, false);
    assert.equal(calls, 3);

    objectRequest.headers.Authorization = "Bearer invalid";
    const invalidObjectBearer = await executeObject();
    assert.equal(invalidObjectBearer.status, 401);
    assert.equal(calls, 3);

    request.method = "GET";
    const wrongMethod = await execute();
    assert.equal(wrongMethod.status, 405);
    assert.equal(calls, 3);
    request.method = "POST";

    request.headers.set("x-api-key", "incorrect-key");
    const wrongKey = await execute();
    assert.equal(wrongKey.status, 401);
    assert.equal(calls, 3);
    request.headers.set("x-api-key", "synthetic-key");

    request.headers.delete("authorization");
    const missingBearer = await execute();
    assert.equal(missingBearer.status, 401);
    assert.equal(calls, 3);

    request.headers.set("authorization", "Bearer invalid");
    const malformedBearer = await execute();
    assert.equal(malformedBearer.status, 401);
    assert.equal(calls, 3);

    request.headers.set(
      "authorization",
      "Bearer aaa.bbb.ccc"
    );
    process.env.WEBSITE_SITE_NAME = "different-site";
    const wrongSite = await execute();
    assert.equal(wrongSite.status, 404);
    assert.equal(calls, 3);

    console.log("DEFAULT_DISABLED_HTTP_404=True");
    console.log("MISSING_OWNER_CONFIGURATION_DENIED=True");
    console.log("SYNTHETIC_VERIFICATION_CONTRACT_PASSED=True");
    console.log("WRONG_SITE_DENIED=True");
    console.log("NON_POST_METHOD_REJECTED=True");
    console.log("INVALID_API_KEY_REJECTED=True");
    console.log("MISSING_BEARER_REJECTED=True");
    console.log("MALFORMED_BEARER_REJECTED=True");
    console.log("NO_STAFF_CREATION_PATH=True");
    console.log("PLAIN_OBJECT_BEARER_ACCEPTED=True");
    console.log("CAPITALIZED_BEARER_ACCEPTED=True");
    console.log("INVALID_OBJECT_BEARER_DENIED=True");
    console.log("K354_HEADER_REGRESSIONS_PASSED=True");
    console.log("K323_OFFLINE_TESTS_PASSED=True");
  } finally {
    process.env = original;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
