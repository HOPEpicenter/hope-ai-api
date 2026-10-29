import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

type BoundaryModule = typeof import("../../src/services/formation/createFormationEventReadOnlyCredentialBoundary");

const BOUNDARY_MODULE_PATH = require.resolve(
  "../../src/services/formation/createFormationEventReadOnlyCredentialBoundary"
);
const WEBSITE_SITE_NAME_SETTING = "WEBSITE_SITE_NAME";
const DEPLOYMENT_ENVIRONMENT_SETTING = "FORMATION_EVENT_DEPLOYMENT_ENVIRONMENT";
const ENDPOINT_SETTING = "FORMATION_EVENT_READ_ONLY_TABLE_ENDPOINT";
const CLIENT_ID_SETTING = "FORMATION_EVENT_READ_ONLY_MANAGED_IDENTITY_CLIENT_ID";
const CLIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAGING = {
  siteName: "hope-ai-api-staging",
  environment: "staging",
  endpoint: "https://hopeaistagingstorage01.table.core.windows.net"
} as const;
const PRODUCTION = {
  siteName: "hope-ai-api-prod",
  environment: "production",
  endpoint: "https://hopeproddatafbafd6e4.table.core.windows.net"
} as const;

function setEnvironment(values: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

let passed = 0;
async function test(name: string, run: () => void | Promise<void>): Promise<void> {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

async function main(): Promise<void> {
  const restoreEnvironment = setEnvironment({
    [WEBSITE_SITE_NAME_SETTING]: undefined,
    [DEPLOYMENT_ENVIRONMENT_SETTING]: undefined,
    [ENDPOINT_SETTING]: undefined,
    [CLIENT_ID_SETTING]: undefined,
    STORAGE_CONNECTION_STRING: "synthetic-shared-key-connection-string",
    AzureWebJobsStorage: "synthetic-host-storage-connection-string"
  });

  try {
    delete require.cache[BOUNDARY_MODULE_PATH];
    const boundaryModule = require(BOUNDARY_MODULE_PATH) as BoundaryModule;
    const {
      createFormationEventReadOnlyCredentialBoundary,
      hasValidFormationEventReadOnlyCredentialConfiguration
    } = boundaryModule;

    await test("dedicated read-only credential readiness remains false", () => {
      assert.equal(boundaryModule.FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY, false);
    });

    await test("configuration requires an exact deployment site and explicit matching environment", () => {
      const invalidConfigurations = [
        {},
        { [WEBSITE_SITE_NAME_SETTING]: "unknown-app" },
        { [WEBSITE_SITE_NAME_SETTING]: STAGING.siteName, [DEPLOYMENT_ENVIRONMENT_SETTING]: "production" },
        { [WEBSITE_SITE_NAME_SETTING]: PRODUCTION.siteName, [DEPLOYMENT_ENVIRONMENT_SETTING]: "staging" },
        {
          [WEBSITE_SITE_NAME_SETTING]: STAGING.siteName,
          [DEPLOYMENT_ENVIRONMENT_SETTING]: STAGING.environment,
          [ENDPOINT_SETTING]: "https://hopeprodhostfbafd6e4.table.core.windows.net",
          [CLIENT_ID_SETTING]: CLIENT_ID
        },
        {
          [WEBSITE_SITE_NAME_SETTING]: STAGING.siteName,
          [DEPLOYMENT_ENVIRONMENT_SETTING]: STAGING.environment,
          [ENDPOINT_SETTING]: "https://example.invalid",
          [CLIENT_ID_SETTING]: CLIENT_ID
        },
        {
          [WEBSITE_SITE_NAME_SETTING]: STAGING.siteName,
          [DEPLOYMENT_ENVIRONMENT_SETTING]: STAGING.environment,
          [ENDPOINT_SETTING]: STAGING.endpoint,
          [CLIENT_ID_SETTING]: "not-a-guid"
        },
        {
          [WEBSITE_SITE_NAME_SETTING]: STAGING.siteName,
          [DEPLOYMENT_ENVIRONMENT_SETTING]: STAGING.environment,
          [ENDPOINT_SETTING]: STAGING.endpoint,
          [CLIENT_ID_SETTING]: undefined
        }
      ];

      for (const values of invalidConfigurations) {
        const restoreCase = setEnvironment(values);
        try {
          assert.equal(hasValidFormationEventReadOnlyCredentialConfiguration(), false);
        } finally {
          restoreCase();
        }
      }
    });

    await test("cross-environment endpoint selection is rejected in both directions", () => {
      for (const [siteName, environment, endpoint] of [
        [STAGING.siteName, STAGING.environment, PRODUCTION.endpoint],
        [PRODUCTION.siteName, PRODUCTION.environment, STAGING.endpoint]
      ]) {
        const restoreCase = setEnvironment({
          [WEBSITE_SITE_NAME_SETTING]: siteName,
          [DEPLOYMENT_ENVIRONMENT_SETTING]: environment,
          [ENDPOINT_SETTING]: endpoint,
          [CLIENT_ID_SETTING]: CLIENT_ID
        });
        try {
          assert.equal(hasValidFormationEventReadOnlyCredentialConfiguration(), false);
        } finally {
          restoreCase();
        }
      }
    });

    await test("approved endpoint is accepted only for its exact Function App identity", () => {
      for (const deployment of [STAGING, PRODUCTION]) {
        const restoreCase = setEnvironment({
          [WEBSITE_SITE_NAME_SETTING]: deployment.siteName,
          [DEPLOYMENT_ENVIRONMENT_SETTING]: deployment.environment,
          [ENDPOINT_SETTING]: deployment.endpoint,
          [CLIENT_ID_SETTING]: CLIENT_ID,
          NODE_ENV: "production"
        });
        try {
          assert.equal(hasValidFormationEventReadOnlyCredentialConfiguration(), true);
        } finally {
          restoreCase();
        }
      }
    });

    await test("factory remains unavailable even with valid configuration and exposes no SDK construction", () => {
      const restoreCase = setEnvironment({
        [WEBSITE_SITE_NAME_SETTING]: STAGING.siteName,
        [DEPLOYMENT_ENVIRONMENT_SETTING]: STAGING.environment,
        [ENDPOINT_SETTING]: STAGING.endpoint,
        [CLIENT_ID_SETTING]: CLIENT_ID,
        STORAGE_CONNECTION_STRING: "synthetic-storage-account-key",
        AzureWebJobsStorage: "synthetic-host-storage"
      });
      const sourcePath = path.resolve(
        __dirname,
        "../../src/services/formation/createFormationEventReadOnlyCredentialBoundary.ts"
      );
      try {
        assert.equal(hasValidFormationEventReadOnlyCredentialConfiguration(), true);
        assert.throws(
          () => createFormationEventReadOnlyCredentialBoundary(),
          error => {
            assert.equal(
              (error as Error).message,
              "Dedicated FormationEvent read-only storage is unavailable"
            );
            return true;
          }
        );
        const source = fs.readFileSync(sourcePath, "utf8");
        assert.doesNotMatch(source, /getConnString|STORAGE_CONNECTION_STRING|AzureWebJobsStorage/);
        assert.doesNotMatch(source, /DefaultAzureCredential|AzureCliCredential|AzureSASCredential|AzureNamedKeyCredential/);
        assert.doesNotMatch(source, /require\(["']@azure\/(?:identity|data-tables)["']\)/);
        assert.equal(boundaryModule.FORMATION_EVENT_READ_ONLY_TABLE_NAME, "devFormationEvents");
      } finally {
        restoreCase();
      }
    });

    await test("async test helper awaits callbacks and propagates rejected assertions", async () => {
      const completed: string[] = [];
      const passedBeforeFailure = passed;
      await assert.rejects(test("synthetic rejected test", async () => {
        await Promise.resolve();
        completed.push("assertions-started");
        throw new Error("synthetic assertion rejection");
      }), /synthetic assertion rejection/);
      assert.deepEqual(completed, ["assertions-started"]);
      assert.equal(passed, passedBeforeFailure);
    });

    console.log(`Passed ${passed} FormationEvent read-only credential boundary tests.`);
  } finally {
    restoreEnvironment();
    delete require.cache[BOUNDARY_MODULE_PATH];
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
