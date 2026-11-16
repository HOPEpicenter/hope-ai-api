import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync, sign
} from "node:crypto";

import {
  createTrustedBootstrapGate
} from "./trusted-bootstrap-gate.mjs";

import {
  KIOSK_BOOTSTRAP_TARGET
} from "./assess-bootstrap-readiness.mjs";

const keys = generateKeyPairSync("ed25519");
const now = new Date();

const config = {
  ownerTenantId: KIOSK_BOOTSTRAP_TARGET.tenantId,
  ownerObjectId: "11111111-2222-4333-8444-555555555555",
  keyId: "synthetic_trusted_key_001"
};

const publicKeyPem = keys.publicKey.export({
  type: "spki",
  format: "pem"
});

const operationId = "synthetic_operation_001";

function envelope() {
  const payload = JSON.stringify({
    operationId,
    purpose: "FIRST_CANONICAL_STAFF_BOOTSTRAP",
    target: { ...KIOSK_BOOTSTRAP_TARGET },
    ownerObjectId: config.ownerObjectId,
    issuedAt: new Date(now.getTime() - 60000).toISOString(),
    expiresAt: new Date(now.getTime() + 300000).toISOString()
  });

  return {
    keyId: config.keyId,
    payload,
    signature: sign(
      null,
      Buffer.from(payload, "utf8"),
      keys.privateKey
    ).toString("base64")
  };
}

function providers(overrides = {}) {
  return {
    async authenticateOwner() {
      return {
        authenticated: true,
        tenantId: config.ownerTenantId,
        objectId: config.ownerObjectId
      };
    },
    async resolvePublicKey(keyId) {
      return {
        keyId,
        active: true,
        publicKeyPem
      };
    },
    ...overrides
  };
}

function assertDisabled(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.reservationWritePermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.authorizationGranted, false);
  assert.equal(result.approvalConsumptionPermitted, false);
  assert.equal(result.realIdentityProviderVerified, false);
}

test("missing trusted providers are rejected", () => {
  assert.throws(
    () => createTrustedBootstrapGate(config, {}),
    /TRUSTED_GATE_CONFIGURATION_REQUIRED/
  );
});

test("matching synthetic owner and signature remain disabled", async () => {
  const gate = createTrustedBootstrapGate(
    config, providers()
  );

  const result = await gate.assess({
    operationId,
    envelope: envelope()
  });

  assertDisabled(result);
  assert.equal(result.signatureValid, true);
  assert.equal(result.authenticatedOwnerMatched, true);
  assert.equal(result.trustedKeyMatched, true);
  assert.equal(
    result.status,
    "TRUST_CONTRACT_MATCHED_EXECUTION_DISABLED"
  );
});

test("unauthenticated identity is rejected before key lookup", async () => {
  let keyCalls = 0;

  const gate = createTrustedBootstrapGate(
    config,
    providers({
      async authenticateOwner() {
        return { authenticated: false };
      },
      async resolvePublicKey() {
        keyCalls++;
        return {};
      }
    })
  );

  const result = await gate.assess({
    operationId,
    envelope: envelope()
  });

  assertDisabled(result);
  assert.equal(result.status, "OWNER_IDENTITY_MISMATCH");
  assert.equal(keyCalls, 0);
});

test("wrong authenticated owner is rejected", async () => {
  const gate = createTrustedBootstrapGate(
    config,
    providers({
      async authenticateOwner() {
        return {
          authenticated: true,
          tenantId: config.ownerTenantId,
          objectId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
        };
      }
    })
  );

  const result = await gate.assess({
    operationId,
    envelope: envelope()
  });

  assertDisabled(result);
  assert.equal(result.status, "OWNER_IDENTITY_MISMATCH");
});

test("wrong trusted key is rejected", async () => {
  const gate = createTrustedBootstrapGate(
    config,
    providers({
      async resolvePublicKey() {
        return {
          keyId: "incorrect_key",
          active: true,
          publicKeyPem
        };
      }
    })
  );

  const result = await gate.assess({
    operationId,
    envelope: envelope()
  });

  assertDisabled(result);
  assert.equal(result.status, "TRUSTED_KEY_MISMATCH");
});

test("tampered signed approval is rejected", async () => {
  const gate = createTrustedBootstrapGate(
    config, providers()
  );

  const item = envelope();
  item.payload += " ";

  const result = await gate.assess({
    operationId,
    envelope: item
  });

  assertDisabled(result);
  assert.equal(result.status, "SIGNED_APPROVAL_INVALID");
});

test("caller-provided owner and key cannot override trust", async () => {
  const gate = createTrustedBootstrapGate(
    config, providers()
  );

  const result = await gate.assess({
    operationId,
    envelope: envelope(),
    ownerObjectId: "attacker",
    keyId: "attacker",
    publicKeyPem: "attacker",
    ownerApproved: true,
    executionPermitted: true
  });

  assertDisabled(result);
  assert.equal(
    result.status,
    "TRUST_CONTRACT_MATCHED_EXECUTION_DISABLED"
  );
});

test("identity provider failure stops before key lookup", async () => {
  let keyCalls = 0;

  const gate = createTrustedBootstrapGate(
    config,
    providers({
      async authenticateOwner() {
        throw new Error("synthetic identity failure");
      },
      async resolvePublicKey() {
        keyCalls++;
        return {};
      }
    })
  );

  const result = await gate.assess({
    operationId,
    envelope: envelope()
  });

  assertDisabled(result);
  assert.equal(result.status, "OWNER_AUTHENTICATION_FAILED");
  assert.equal(keyCalls, 0);
});

test("gate has no storage or Staff writer capabilities", () => {
  const gate = createTrustedBootstrapGate(
    config, providers()
  );

  assert.equal(gate.createStaff, undefined);
  assert.equal(gate.consume, undefined);
  assert.equal(gate.createEntity, undefined);
  assert.equal(gate.submitTransaction, undefined);
  assert.equal(Object.isFrozen(gate), true);
});