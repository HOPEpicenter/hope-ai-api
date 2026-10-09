import assert from "node:assert/strict";
import {
  constants,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes
} from "node:crypto";

import {
  OAuthKeyWrapClient,
  OAuthKeyWrapPolicy,
  unwrapOAuthDataKey,
  wrapOAuthDataKey
} from "../../src/services/authorization/oauthKeyVaultWrapping";

const firstReference =
  "https://hope-test-vault.vault.azure.net/keys/oauth-key/" +
  "0123456789abcdef0123456789abcdef";

const secondReference =
  "https://hope-test-vault.vault.azure.net/keys/oauth-key/" +
  "abcdef0123456789abcdef0123456789";

const otherReference =
  "https://other-test-vault.vault.azure.net/keys/oauth-key/" +
  "0123456789abcdef0123456789abcdef";

const pair = generateKeyPairSync("rsa", {
  modulusLength: 2048
});

const oldPair = generateKeyPairSync("rsa", {
  modulusLength: 2048
});

const keys = new Map([
  [firstReference, pair],
  [secondReference, oldPair]
]);

let wrapCalls = 0;
let unwrapCalls = 0;

const client: OAuthKeyWrapClient = {
  async wrapKey(reference, algorithm, bytes) {
    wrapCalls += 1;
    assert.equal(algorithm, "RSA-OAEP-256");

    const selected = keys.get(reference);
    if (!selected) throw new Error("unknown key");

    return {
      keyReference: reference,
      algorithm,
      result: publicEncrypt({
        key: selected.publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      }, bytes)
    };
  },

  async unwrapKey(reference, algorithm, bytes) {
    unwrapCalls += 1;
    assert.equal(algorithm, "RSA-OAEP-256");

    const selected = keys.get(reference);
    if (!selected) throw new Error("unknown key");

    return {
      keyReference: reference,
      algorithm,
      result: privateDecrypt({
        key: selected.privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256"
      }, bytes)
    };
  }
};

const policy: OAuthKeyWrapPolicy = {
  currentKeyReference: firstReference,
  permittedKeyReferences: [firstReference, secondReference]
};

async function main(): Promise<void> {
const dataKey = randomBytes(32);
const wrapped = await wrapOAuthDataKey(client, policy, dataKey);

assert.equal(wrapped.keyReference, firstReference);
assert.equal(wrapped.wrappingAlgorithm, "RSA-OAEP-256");
assert.equal(Buffer.from(wrapped.wrappedDataKey, "base64url").length, 256);
assert.deepEqual(await unwrapOAuthDataKey(client, policy, wrapped), dataKey);

const oldPolicy: OAuthKeyWrapPolicy = {
  currentKeyReference: secondReference,
  permittedKeyReferences: [firstReference, secondReference]
};

const older = await wrapOAuthDataKey(client, oldPolicy, dataKey);

assert.deepEqual(await unwrapOAuthDataKey(client, policy, older), dataKey);

async function mustReject(operation: () => Promise<unknown>) {
  await assert.rejects(operation);
}

const priorUnwrapCalls = unwrapCalls;

await mustReject(() =>
  unwrapOAuthDataKey(client, policy, {
    ...wrapped,
    keyReference: otherReference
  })
);

assert.equal(unwrapCalls, priorUnwrapCalls);

await mustReject(() =>
  unwrapOAuthDataKey(client, policy, {
    ...wrapped,
    wrappingAlgorithm: "RSA-OAEP" as "RSA-OAEP-256"
  })
);

await mustReject(() =>
  unwrapOAuthDataKey(client, policy, {
    ...wrapped,
    wrappedDataKey: "!"
  })
);

await mustReject(() =>
  unwrapOAuthDataKey(client, policy, {
    ...wrapped,
    wrappedDataKey: wrapped.wrappedDataKey + "="
  })
);

await mustReject(() =>
  unwrapOAuthDataKey(client, policy, {
    ...wrapped,
    unexpected: "extra"
  } as typeof wrapped)
);

await mustReject(() =>
  wrapOAuthDataKey(client, policy, randomBytes(16))
);

await mustReject(() =>
  wrapOAuthDataKey(client, policy, randomBytes(33))
);

await mustReject(() =>
  wrapOAuthDataKey(client, {
    currentKeyReference: otherReference,
    permittedKeyReferences: [firstReference]
  }, dataKey)
);

await mustReject(() =>
  unwrapOAuthDataKey(client, {
    currentKeyReference: firstReference,
    permittedKeyReferences: [firstReference]
  }, older)
);

const badClient: OAuthKeyWrapClient = {
  async wrapKey() {
    return {
      keyReference: otherReference,
      algorithm: "RSA-OAEP-256",
      result: Buffer.alloc(256)
    };
  },
  async unwrapKey() {
    return {
      keyReference: otherReference,
      algorithm: "RSA-OAEP-256",
      result: Buffer.alloc(32)
    };
  }
};

await mustReject(() => wrapOAuthDataKey(badClient, policy, dataKey));
await mustReject(() => unwrapOAuthDataKey(badClient, policy, wrapped));

const failingClient: OAuthKeyWrapClient = {
  async wrapKey() { throw new Error("synthetic provider failure"); },
  async unwrapKey() { throw new Error("synthetic provider failure"); }
};

await mustReject(() => wrapOAuthDataKey(failingClient, policy, dataKey));
await mustReject(() => unwrapOAuthDataKey(failingClient, policy, wrapped));

assert.ok(wrapCalls >= 2);
assert.ok(unwrapCalls >= 2);

console.log("oauthKeyVaultWrapping synthetic mock tests passed");
}

main().catch((error: unknown) => {
  console.error("oauthKeyVaultWrapping synthetic tests failed");
  process.exitCode = 1;
});
