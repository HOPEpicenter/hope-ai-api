import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT
} from "jose";
import {
  PhaseCVerifyAndClaimOperationCredential
} from "../../src/services/authorization/phaseCVerifyAndClaimOperationCredential";

async function main(): Promise<void> {
  const keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  jwk.kid = "synthetic-trusted-key";
  jwk.alg = "RS256";
  jwk.use = "sig";

  const resolver = createLocalJWKSet({ keys: [jwk] });

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
    key: CryptoKey,
    changes: Record<string, unknown> = {}
  ): Promise<string> {
    return new SignJWT({
      operationId: expected.operationId,
      requestId: expected.requestId,
      resourceScope: expected.resourceScope,
      runbookName: expected.runbookName,
      oneTimeUse: true,
      approvalProvenance: "synthetic-approval",
      ...changes
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "synthetic-trusted-key"
      })
      .setIssuer(expected.issuer)
      .setAudience(expected.audience)
      .setJti(credentialId)
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(key);
  }

  const calls: unknown[] = [];
  let storageStatus:
    "claimed" | "conflict" | "uncertain" = "claimed";
  let throwStorage = false;

  const repository = {
    async claim(value: unknown) {
      calls.push(value);

      if (throwStorage) {
        throw new Error("synthetic unknown storage outcome");
      }

      return {
        status: storageStatus,
        executionAuthorized: false as const,
        retryAuthorized: false as const
      };
    }
  };

  const service = new PhaseCVerifyAndClaimOperationCredential(
    expected,
    resolver,
    repository
  );

  const accepted = await service.process(
    await sign(keys.privateKey)
  );

  assert.deepEqual(accepted, {
    status: "claimed",
    executionAuthorized: false,
    retryAuthorized: false
  });

  assert.deepEqual(calls[0], {
    credentialId,
    operationId: expected.operationId,
    requestId: expected.requestId,
    expiresUtc: now + 120
  });

  console.log("PASS=VERIFIED_TOKEN_REQUIRED_BEFORE_CLAIM");

  const countAfterValid = calls.length;

  const forgedObject = {
    verified: true,
    credentialId,
    operationId: expected.operationId,
    requestId: expected.requestId
  };

  assert.equal(
    (await service.process(forgedObject)).status,
    "verification_denied"
  );
  assert.equal(calls.length, countAfterValid);

  console.log("PASS=CALLER_VERIFIED_OBJECT_DENIED");

  const attacker = await generateKeyPair("RS256");

  assert.equal(
    (await service.process(
      await sign(attacker.privateKey)
    )).status,
    "verification_denied"
  );
  assert.equal(calls.length, countAfterValid);

  console.log("PASS=UNTRUSTED_SIGNATURE_CANNOT_CLAIM");

  assert.equal(
    (await service.process(
      await sign(keys.privateKey, {
        resourceScope: "unauthorized-resource"
      })
    )).status,
    "verification_denied"
  );
  assert.equal(calls.length, countAfterValid);

  console.log("PASS=WRONG_RESOURCE_CANNOT_CLAIM");

  storageStatus = "conflict";

  assert.deepEqual(
    await service.process(await sign(keys.privateKey)),
    {
      status: "conflict",
      executionAuthorized: false,
      retryAuthorized: false
    }
  );

  console.log("PASS=STORAGE_CONFLICT_NON_AUTHORIZING");

  storageStatus = "uncertain";

  assert.deepEqual(
    await service.process(await sign(keys.privateKey)),
    {
      status: "uncertain",
      executionAuthorized: false,
      retryAuthorized: false
    }
  );

  throwStorage = true;

  assert.deepEqual(
    await service.process(await sign(keys.privateKey)),
    {
      status: "uncertain",
      executionAuthorized: false,
      retryAuthorized: false
    }
  );

  console.log("PASS=STORAGE_UNCERTAINTY_NON_AUTHORIZING");
  console.log("PHASE_C_VERIFY_AND_CLAIM_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
