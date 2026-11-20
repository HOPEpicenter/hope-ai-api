import assert from "node:assert/strict";
import {
  postKioskOwnerDevicePairing
} from "../../src/functions/postKioskOwnerDevicePairing";

const DEVICE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const API_KEY = "synthetic-api-key";
const AUTHORITY_KEY = "synthetic-authority-key-for-test-only-123456789";
const TOKEN = "synthetic-token";

const names = [
  "WEBSITE_SITE_NAME",
  "FEATURE_KIOSK_OWNER_PAIRING",
  "HOPE_KIOSK_DEVICE_AUTHORITY_ENABLED",
  "HOPE_API_KEY",
  "HOPE_KIOSK_DEVICE_AUTHORITY_KEY"
] as const;

const saved = Object.fromEntries(
  names.map(name => [name, process.env[name]])
);

type Scenario = {
  status: number;
  feature?: string;
  site?: string;
  apiKey?: string;
  authorityKey?: string;
  token?: string;
  contentType?: string;
  body?: unknown;
  authorized?: boolean;
  malformedGrant?: boolean;
  registryFailure?: boolean;
  expectedRegistrations?: number;
};

async function run(): Promise<void> {
  let passed = 0;

  async function check(
    name: string,
    scenario: Scenario
  ): Promise<void> {
    process.env.WEBSITE_SITE_NAME =
      scenario.site ?? "hope-kiosk-acceptance-api";
    process.env.FEATURE_KIOSK_OWNER_PAIRING =
      scenario.feature ?? "true";
    process.env.HOPE_KIOSK_DEVICE_AUTHORITY_ENABLED =
      "true";
    process.env.HOPE_API_KEY = API_KEY;
    process.env.HOPE_KIOSK_DEVICE_AUTHORITY_KEY =
      AUTHORITY_KEY;

    let authorizations = 0;
    let registrations = 0;

    const body = scenario.body === undefined
      ? {
          deviceId: DEVICE,
          expiresAtSeconds:
            Math.floor(Date.now() / 1000) + 3600
        }
      : scenario.body;

    const request = {
      headers: {
        "x-api-key": scenario.apiKey ?? API_KEY,
        "x-kiosk-device-authority-key":
          scenario.authorityKey ?? AUTHORITY_KEY,
        "authorization": scenario.token === ""
          ? ""
          : `Bearer ${scenario.token ?? TOKEN}`,
        "content-type": scenario.contentType ??
          "application/json"
      },
      body
    };

    const context: {
      res?: {
        status: number;
        body: Record<string, unknown>;
      };
    } = {};

    await postKioskOwnerDevicePairing(
      context,
      request,
      {
        authorize: async () => {
          authorizations++;
          return {
            authorized: scenario.authorized === true,
            staffAuthorityGranted:
              scenario.malformedGrant === true
                ? true as never
                : false,
            staffCreationPermitted: false
          };
        },
        register: async () => {
          registrations++;
          if (scenario.registryFailure) {
            throw new Error("synthetic storage failure");
          }
        }
      }
    );

    assert.equal(
      context.res?.status,
      scenario.status,
      name
    );

    assert.equal(
      registrations,
      scenario.expectedRegistrations ?? 0,
      `${name}: registration count`
    );

    if (scenario.status === 201) {
      assert.equal(authorizations, 1);
      assert.equal(context.res?.body.status, "registered");
    }

    if (scenario.status !== 201) {
      assert.notEqual(context.res?.body.ok, true);
    }

    passed++;
  }

  try {
    await check("feature disabled", {
      status: 404,
      feature: "false"
    });

    await check("wrong function app", {
      status: 404,
      site: "wrong-app"
    });

    await check("invalid API key", {
      status: 403,
      apiKey: "invalid-api-key"
    });

    await check("invalid device authority key", {
      status: 403,
      authorityKey: "invalid-authority-key"
    });

    await check("missing owner token", {
      status: 401,
      token: ""
    });

    await check("invalid content type", {
      status: 415,
      contentType: "text/plain"
    });

    await check("invalid device request", {
      status: 400,
      body: { deviceId: "invalid", expiresAtSeconds: 1 }
    });

    await check("owner authorization denied", {
      status: 403
    });

    await check("malformed grant denied", {
      status: 403,
      authorized: true,
      malformedGrant: true
    });

    await check("authorized device registered", {
      status: 201,
      authorized: true,
      expectedRegistrations: 1
    });

    assert.equal(passed, 10);
    console.log("PAIRING_ENDPOINT_TESTS_PASSED=10");
  } finally {
    for (const name of names) {
      const value = saved[name];

      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

run().catch(() => {
  console.error("PAIRING_ENDPOINT_TESTS_FAILED");
  process.exitCode = 1;
});