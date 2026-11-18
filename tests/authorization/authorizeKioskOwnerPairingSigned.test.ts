import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT
} from "jose";
import {
  authorizeKioskOwnerPairing
} from "../../src/services/authorization/authorizeKioskOwnerPairing";

const tenant = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const client = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const audience = "api://hope-kiosk-pairing-synthetic";
const scope = "kiosk.device.pair";

const configNames = [
  "WEBSITE_SITE_NAME",
  "FEATURE_KIOSK_OWNER_PAIRING",
  "KIOSK_PAIRING_OWNER_OBJECT_ID",
  "KIOSK_PAIRING_API_AUDIENCE",
  "KIOSK_PAIRING_CLIENT_APPLICATION_ID"
] as const;

async function run(): Promise<void> {
  const original = Object.fromEntries(
    configNames.map(name => [name, process.env[name]])
  );

  try {
    process.env.WEBSITE_SITE_NAME =
      "hope-kiosk-acceptance-api";
    process.env.FEATURE_KIOSK_OWNER_PAIRING = "true";
    process.env.KIOSK_PAIRING_OWNER_OBJECT_ID = owner;
    process.env.KIOSK_PAIRING_API_AUDIENCE = audience;
    process.env.KIOSK_PAIRING_CLIENT_APPLICATION_ID = client;

    const { privateKey, publicKey } =
      await generateKeyPair("RS256");

    const jwk = await exportJWK(publicKey);
    jwk.kid = "synthetic-pairing-test";
    jwk.alg = "RS256";
    jwk.use = "sig";

    const resolver = createLocalJWKSet({ keys: [jwk] });
    const now = Math.floor(Date.now() / 1000);

    async function token(
      overrides: Record<string, unknown> = {},
      aud: string = audience,
      issuer: string =
        `https://login.microsoftonline.com/${tenant}/v2.0`,
      expiration: number = now + 1800
    ): Promise<string> {
      return new SignJWT({
        ver: "2.0",
        tid: tenant,
        oid: owner,
        azp: client,
        scp: scope,
        ...overrides
      })
        .setProtectedHeader({
          alg: "RS256",
          kid: "synthetic-pairing-test"
        })
        .setIssuer(issuer)
        .setAudience(aud)
        .setIssuedAt(now - 60)
        .setExpirationTime(expiration)
        .sign(privateKey);
    }

    let passed = 0;

    async function expect(
      name: string,
      jwt: string,
      authorized: boolean
    ): Promise<void> {
      const result = await authorizeKioskOwnerPairing(
        jwt,
        resolver
      );

      assert.deepEqual(result, {
        authorized,
        staffAuthorityGranted: false,
        staffCreationPermitted: false
      }, name);

      passed++;
    }

    await expect("valid owner and scope", await token(), true);
    await expect("wrong owner", await token({ oid: other }), false);
    await expect("wrong tenant", await token({ tid: other }), false);
    await expect("wrong client", await token({ azp: other }), false);
    await expect("wrong scope", await token({ scp: "staff.access" }), false);
    await expect("missing scope", await token({ scp: undefined }), false);
    await expect("wrong audience", await token({}, "api://other"), false);
    await expect(
      "wrong issuer",
      await token(
        {},
        audience,
        `https://login.microsoftonline.com/${other}/v2.0`
      ),
      false
    );
    await expect(
      "expired token",
      await token({}, audience, undefined, now - 10),
      false
    );

    process.env.FEATURE_KIOSK_OWNER_PAIRING = "false";
    await expect("feature disabled", await token(), false);

    assert.equal(passed, 10);
    console.log("SIGNED_PAIRING_AUTHORIZATION_TESTS_PASSED=10");
  } finally {
    for (const name of configNames) {
      const value = original[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

run().catch(() => {
  console.error("SIGNED_PAIRING_AUTHORIZATION_TESTS_FAILED");
  process.exitCode = 1;
});