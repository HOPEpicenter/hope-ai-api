import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  randomUUID
} from "node:crypto";
import { SignJWT } from "jose";

import {
  createPhaseCPinnedSigningKeyResolver
} from "../../src/services/authorization/createPhaseCPinnedSigningKeyResolver";

import {
  PhaseCVerifyAndClaimOperationCredential
} from "../../src/services/authorization/phaseCVerifyAndClaimOperationCredential";

async function main(): Promise<void> {
  const trusted = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  const attacker = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  const publicKeyPem = trusted.publicKey.export({
    type: "spki",
    format: "pem"
  }).toString();

  const fingerprint = createHash("sha256")
    .update(trusted.publicKey.export({
      type: "spki",
      format: "der"
    }))
    .digest("hex");

  const pinnedResolver =
    createPhaseCPinnedSigningKeyResolver({
      publicKeyPem,
      publicKeySha256: fingerprint,
      keyId: "phase-c-synthetic-key"
    });

  const expected = {
    issuer: "https://synthetic-issuer.invalid/phase-c",
    audience: "hope-phase-c-operation",
    operationId: randomUUID(),
    requestId: randomUUID(),
    resourceScope: "synthetic-private-resource",
    runbookName: "synthetic-operation-aware-runbook"
  };

  const now = Math.floor(Date.now() / 1000);
  const credentialId = randomUUID();

  async function sign(
    key: typeof trusted.privateKey,
    changes: Record<string, unknown> = {},
    headerChanges: Record<string, unknown> = {}
  ): Promise<string> {
    return new SignJWT({
      operationId: expected.operationId,
      requestId: expected.requestId,
      resourceScope: expected.resourceScope,
      runbookName: expected.runbookName,
      oneTimeUse: true,
      approvalProvenance: "synthetic-only",
      ...changes
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "phase-c-synthetic-key",
        ...headerChanges
      })
      .setIssuer(expected.issuer)
      .setAudience(expected.audience)
      .setJti(credentialId)
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(key);
  }

  const claimedIds = new Set<string>();
  let storageCalls = 0;

  const repository = {
    async claim(value: unknown) {
      storageCalls++;

      const item = value as {
        credentialId: string;
        operationId: string;
        requestId: string;
      };

      assert.equal(item.credentialId, credentialId);
      assert.equal(item.operationId, expected.operationId);
      assert.equal(item.requestId, expected.requestId);

      const status = claimedIds.has(item.credentialId)
        ? "conflict" as const
        : "claimed" as const;

      claimedIds.add(item.credentialId);

      return {
        status,
        executionAuthorized: false as const,
        retryAuthorized: false as const
      };
    }
  };

  const service = new PhaseCVerifyAndClaimOperationCredential(
    expected,
    pinnedResolver,
    repository
  );

  const signed = await sign(trusted.privateKey);

  assert.deepEqual(await service.process(signed), {
    status: "claimed",
    executionAuthorized: false,
    retryAuthorized: false
  });

  assert.equal(storageCalls, 1);

  console.log("PASS=PINNED_VERIFICATION_REACHES_CLAIM");

  assert.deepEqual(await service.process(signed), {
    status: "conflict",
    executionAuthorized: false,
    retryAuthorized: false
  });

  assert.equal(storageCalls, 2);

  console.log("PASS=REPLAY_CONFLICT_NON_AUTHORIZING");

  const beforeDenied = storageCalls;

  const attempts: unknown[] = [
    await sign(attacker.privateKey),
    await sign(trusted.privateKey, {
      resourceScope: "different-resource"
    }),
    await sign(trusted.privateKey, {
      operationId: randomUUID()
    }),
    await sign(trusted.privateKey, {}, {
      kid: "attacker-key"
    }),
    await sign(trusted.privateKey, {}, {
      jku: "https://attacker.invalid/keys"
    }),
    {
      verified: true,
      operationId: expected.operationId,
      credentialId
    }
  ];

  for (const attempt of attempts) {
    const result = await service.process(attempt);

    assert.deepEqual(result, {
      status: "verification_denied",
      executionAuthorized: false,
      retryAuthorized: false
    });
  }

  assert.equal(storageCalls, beforeDenied);

  console.log("PASS=FORGED_CREDENTIALS_NEVER_REACH_STORAGE");

  assert.throws(
    () => createPhaseCPinnedSigningKeyResolver({
      publicKeyPem,
      publicKeySha256: "0".repeat(64),
      keyId: "phase-c-synthetic-key"
    })
  );

  console.log("PASS=INCORRECT_TRUST_ANCHOR_REJECTED");

  console.log("PHASE_C_PINNED_CLAIM_INTEGRATION_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
