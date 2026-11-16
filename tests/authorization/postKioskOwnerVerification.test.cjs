"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { generateKeyPairSync } = require("node:crypto");
const ts = require("typescript");

Module._extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  });
  module._compile(output.outputText, filename);
};

const {
  postKioskOwnerVerification
} = require(path.resolve(
  process.cwd(),
  "src/functions/postKioskOwnerVerification/index.ts"
));

const functionDirectory = path.resolve(
  process.cwd(),
  "src/functions/postKioskOwnerVerification"
);
const ownerKeys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001
});
const tenantId = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const ownerId = "11111111-2222-4333-8444-555555555555";
const otherId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const clientId = "22222222-3333-4444-8555-666666666666";
const audience = "api://synthetic-kiosk-bootstrap";
const scope = "Kiosk.Bootstrap";
const syntheticApiKey = "synthetic-server-to-server-key";

const environmentNames = [
  "WEBSITE_SITE_NAME",
  "FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION",
  "KIOSK_BOOTSTRAP_ENTRA_TENANT_ID",
  "KIOSK_BOOTSTRAP_OWNER_OBJECT_ID",
  "KIOSK_BOOTSTRAP_CLIENT_APPLICATION_ID",
  "KIOSK_BOOTSTRAP_API_AUDIENCE",
  "KIOSK_BOOTSTRAP_REQUIRED_SCOPE",
  "HOPE_API_KEY"
];

function request(options = {}) {
  return {
    headers: {
      "x-api-key": options.apiKey ?? syntheticApiKey,
      ...(options.token
        ? { authorization: `Bearer ${options.token}` }
        : {})
    },
    ...(options.query ? { query: options.query } : {}),
    ...(options.body ? { body: options.body } : {})
  };
}

async function execute(req, resolveSigningKey) {
  const context = {};
  await postKioskOwnerVerification(
    context,
    req,
    resolveSigningKey ? { resolveSigningKey } : {}
  );
  return context.res;
}

function assertNoAuthority(response) {
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.body.executionPermitted, false);
  assert.equal(response.body.staffCreationPermitted, false);
  assert.equal(response.body.authorizationGranted, false);
  assert.equal(response.body.approvalConsumptionPermitted, false);
}

function restoreEnvironment(previous) {
  for (const name of environmentNames) {
    const value = previous.get(name);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

async function withEnvironment(action) {
  const previous = new Map(
    environmentNames.map(name => [name, process.env[name]])
  );

  process.env.WEBSITE_SITE_NAME = "hope-kiosk-acceptance-api";
  process.env.FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION = "true";
  process.env.KIOSK_BOOTSTRAP_ENTRA_TENANT_ID = tenantId;
  process.env.KIOSK_BOOTSTRAP_OWNER_OBJECT_ID = ownerId;
  process.env.KIOSK_BOOTSTRAP_CLIENT_APPLICATION_ID = clientId;
  process.env.KIOSK_BOOTSTRAP_API_AUDIENCE = audience;
  process.env.KIOSK_BOOTSTRAP_REQUIRED_SCOPE = scope;
  process.env.HOPE_API_KEY = syntheticApiKey;

  try {
    await action();
  } finally {
    restoreEnvironment(previous);
  }
}

async function signToken(options = {}) {
  const jose = await import("jose");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ver: "2.0",
    tid: tenantId,
    oid: ownerId,
    azp: clientId,
    scp: scope,
    ...options.claims
  };

  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(
      options.issuer ??
        `https://login.microsoftonline.com/${tenantId}/v2.0`
    )
    .setAudience(options.audience ?? audience)
    .setIssuedAt(options.issuedAt ?? now - 60)
    .setExpirationTime(options.expiresAt ?? now + 300)
    .sign(ownerKeys.privateKey);
}

function syntheticSigningKeyResolver(calls) {
  return async () => {
    calls.count++;
    return ownerKeys.publicKey;
  };
}

test("Function binding is HTTP-only and handler has no storage imports", () => {
  const bindingPath = path.join(functionDirectory, "function.json");
  const config = JSON.parse(fs.readFileSync(bindingPath, "utf8"));
  const bindings = config.bindings;

  assert.equal(config.entryPoint, "postKioskOwnerVerification");
  assert.deepEqual(
    bindings.map(binding => binding.type).sort(),
    ["http", "httpTrigger"]
  );

  const trigger = bindings.find(
    binding => binding.type === "httpTrigger"
  );
  assert.equal(trigger.authLevel, "anonymous");
  assert.deepEqual(trigger.methods, ["post"]);
  assert.equal(trigger.route, "kiosk/owner-verification");

  const source = fs.readFileSync(
    path.join(functionDirectory, "index.ts"),
    "utf8"
  );
  assert.doesNotMatch(
    source,
    /@azure\/data-tables|TableClient|tableClient|repositories\//
  );
  assert.doesNotMatch(source, /console\.(log|info|warn|error)\s*\(/);
});

for (const [name, site] of [
  ["production site", "hope-ai-api"],
  ["staging site", "hope-ai-api-staging"],
  ["unknown site", "hope-kiosk-unrecognized-api"]
]) {
  test(`${name} is unavailable while owner verification is enabled`, async () => {
    await withEnvironment(async () => {
      process.env.WEBSITE_SITE_NAME = site;
      process.env.FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION = "true";
      assert.equal(
        process.env.FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION,
        "true"
      );

      const calls = { count: 0 };
      const response = await execute(
        request({ token: await signToken() }),
        syntheticSigningKeyResolver(calls)
      );

      assert.equal(response.status, 404);
      assertNoAuthority(response);
      assert.equal(calls.count, 0);
    });
  });
}

for (const [name, flag] of [
  ["disabled flag", "false"],
  ["non-exact flag", "TRUE"],
  ["missing flag", undefined]
]) {
  test(`${name} is unavailable`, async () => {
    await withEnvironment(async () => {
      if (flag === undefined) {
        delete process.env.FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION;
      } else {
        process.env.FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION = flag;
      }

      const calls = { count: 0 };
      const response = await execute(
        request({ token: await signToken() }),
        syntheticSigningKeyResolver(calls)
      );

      assert.equal(response.status, 404);
      assertNoAuthority(response);
      assert.equal(calls.count, 0);
    });
  });
}

for (const [name, apiKey] of [
  ["missing API key", ""],
  ["wrong API key", "incorrect-synthetic-key"]
]) {
  test(`${name} is rejected`, async () => {
    await withEnvironment(async () => {
      const calls = { count: 0 };
      const response = await execute(
        request({ apiKey, token: await signToken() }),
        syntheticSigningKeyResolver(calls)
      );

      assert.equal(response.status, 401);
      assertNoAuthority(response);
      assert.equal(calls.count, 0);
    });
  });
}

test("missing bearer token is rejected even when supplied in URL or body", async () => {
  await withEnvironment(async () => {
    const token = await signToken();
    const calls = { count: 0 };
    const response = await execute(
      request({
        query: { access_token: token },
        body: { accessToken: token }
      }),
      syntheticSigningKeyResolver(calls)
    );

    assert.equal(response.status, 401);
    assertNoAuthority(response);
    assert.equal(calls.count, 0);
  });
});

const invalidTokens = [
  ["tampered token", async () => {
    const token = await signToken();
    const segments = token.split(".");
    const signature = segments[2];
    segments[2] =
      `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    return segments.join(".");
  }],
  ["expired token", () => {
    const now = Math.floor(Date.now() / 1000);
    return signToken({
      issuedAt: now - 600,
      expiresAt: now - 300
    });
  }],
  ["wrong owner", () =>
    signToken({ claims: { oid: otherId } })],
  ["wrong tenant", () =>
    signToken({ claims: { tid: otherId } })],
  ["wrong audience", () =>
    signToken({ audience: "api://wrong-synthetic-audience" })],
  ["wrong client", () =>
    signToken({ claims: { azp: otherId } })],
  ["wrong scope", () =>
    signToken({ claims: { scp: "User.Read" } })]
];

for (const [name, tokenFactory] of invalidTokens) {
  test(`${name} is denied without exposing token details`, async () => {
    await withEnvironment(async () => {
      const accessToken = await tokenFactory();
      const calls = { count: 0 };
      const response = await execute(
        request({ token: accessToken }),
        syntheticSigningKeyResolver(calls)
      );

      assert.equal(response.status, 401);
      assert.equal(response.body.verified, false);
      assert.equal(response.body.status, "OWNER_TOKEN_NOT_VERIFIED");
      assertNoAuthority(response);
      assert.equal(JSON.stringify(response).includes(accessToken), false);
      assert.ok(calls.count > 0);
    });
  });
}

test("signing-key failure fails closed without leaking verifier errors", async () => {
  await withEnvironment(async () => {
    const accessToken = await signToken();
    const response = await execute(
      request({ token: accessToken }),
      async () => {
        throw new Error("synthetic signing key failure");
      }
    );

    assert.equal(response.status, 401);
    assert.equal(response.body.verified, false);
    assertNoAuthority(response);
    assert.equal(
      JSON.stringify(response).includes("synthetic signing key failure"),
      false
    );
  });
});

test("caller-supplied trust and execution fields cannot override environment", async () => {
  await withEnvironment(async () => {
    const accessToken = await signToken();
    const calls = { count: 0 };
    const response = await execute(
      request({
        token: accessToken,
        query: {
          tenantId: otherId,
          ownerObjectId: otherId,
          audience: "api://attacker",
          requiredScope: "Attacker.Scope",
          clientApplicationId: otherId,
          key: "attacker-key",
          executionPermitted: true
        },
        body: {
          identity: { tenantId: otherId, objectId: otherId },
          configuration: {
            tenantId: otherId,
            ownerObjectId: otherId,
            audience: "api://attacker",
            requiredScope: "Attacker.Scope",
            allowedClientApplicationId: otherId
          },
          signingKey: "attacker-key",
          publicKeyPem: "attacker-key",
          target: { functionApp: "attacker-app" },
          executionPermitted: true,
          staffCreationPermitted: true,
          authorizationGranted: true,
          approvalConsumptionPermitted: true
        }
      }),
      syntheticSigningKeyResolver(calls)
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.verified, true);
    assert.equal(
      response.body.status,
      "OWNER_TOKEN_VERIFIED_EXECUTION_DISABLED"
    );
    assertNoAuthority(response);
    assert.equal(calls.count, 1);
    assert.equal(JSON.stringify(response).includes(accessToken), false);
  });
});

test("valid owner token verifies with all execution capabilities disabled", async () => {
  await withEnvironment(async () => {
    const accessToken = await signToken();
    const calls = { count: 0 };
    const response = await execute(
      request({ token: accessToken }),
      syntheticSigningKeyResolver(calls)
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.verified, true);
    assertNoAuthority(response);
    assert.equal(calls.count, 1);
    assert.equal(JSON.stringify(response).includes(accessToken), false);
  });
});
