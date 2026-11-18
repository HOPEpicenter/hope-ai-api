import assert from "node:assert/strict";
import {
  authorizeKioskOwnerPairing
} from "../../src/services/authorization/authorizeKioskOwnerPairing";

const ORIGINAL = {
  site: process.env.WEBSITE_SITE_NAME,
  feature: process.env.FEATURE_KIOSK_OWNER_PAIRING,
  owner: process.env.KIOSK_PAIRING_OWNER_OBJECT_ID,
  audience: process.env.KIOSK_PAIRING_API_AUDIENCE,
  client: process.env.KIOSK_PAIRING_CLIENT_APPLICATION_ID
};

const GUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let passed = 0;

async function denies(
  name: string,
  configure: () => void,
  token: unknown
): Promise<void> {
  configure();
  const result = await authorizeKioskOwnerPairing(token);

  assert.deepEqual(result, {
    authorized: false,
    staffAuthorityGranted: false,
    staffCreationPermitted: false
  }, name);

  passed++;
}

async function run(): Promise<void> {
  try {
    process.env.WEBSITE_SITE_NAME =
      "hope-kiosk-acceptance-api";
    process.env.FEATURE_KIOSK_OWNER_PAIRING = "false";

    process.env.KIOSK_PAIRING_OWNER_OBJECT_ID = GUID;
    process.env.KIOSK_PAIRING_API_AUDIENCE =
      "api://hope-kiosk-pairing-test";
    process.env.KIOSK_PAIRING_CLIENT_APPLICATION_ID = GUID;

    await denies("disabled feature", () => {}, "invalid-token");

    await denies("missing token", () => {
      process.env.FEATURE_KIOSK_OWNER_PAIRING = "true";
    }, undefined);

    await denies("wrong site", () => {
      process.env.WEBSITE_SITE_NAME = "another-site";
    }, "invalid-token");

    await denies("invalid owner", () => {
      process.env.WEBSITE_SITE_NAME =
        "hope-kiosk-acceptance-api";
      process.env.KIOSK_PAIRING_OWNER_OBJECT_ID =
        "not-a-guid";
    }, "invalid-token");

    await denies("invalid audience", () => {
      process.env.KIOSK_PAIRING_OWNER_OBJECT_ID = GUID;
      process.env.KIOSK_PAIRING_API_AUDIENCE = "";
    }, "invalid-token");

    await denies("invalid client", () => {
      process.env.KIOSK_PAIRING_API_AUDIENCE =
        "api://hope-kiosk-pairing-test";
      process.env.KIOSK_PAIRING_CLIENT_APPLICATION_ID =
        "not-a-guid";
    }, "invalid-token");

    await denies("malformed token", () => {
      process.env.KIOSK_PAIRING_CLIENT_APPLICATION_ID = GUID;
    }, "invalid-token");

    assert.equal(passed, 7);
    console.log("PAIRING_DENIAL_TESTS_PASSED=7");
  } finally {
    const restore = (
      name: string,
      value: string | undefined
    ) => {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    };

    restore("WEBSITE_SITE_NAME", ORIGINAL.site);
    restore("FEATURE_KIOSK_OWNER_PAIRING", ORIGINAL.feature);
    restore("KIOSK_PAIRING_OWNER_OBJECT_ID", ORIGINAL.owner);
    restore("KIOSK_PAIRING_API_AUDIENCE", ORIGINAL.audience);
    restore("KIOSK_PAIRING_CLIENT_APPLICATION_ID", ORIGINAL.client);
  }
}

run().catch(() => {
  console.error("PAIRING_DENIAL_TESTS_FAILED");
  process.exitCode = 1;
});