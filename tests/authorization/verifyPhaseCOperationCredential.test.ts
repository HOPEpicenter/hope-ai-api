import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT
} from "jose";

import {
  verifyPhaseCOperationCredential
} from "../../src/services/authorization/verifyPhaseCOperationCredential";

async function main(): Promise<void> {
  const keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  jwk.kid = "synthetic-phase-c-key";
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

  async function sign(
    changes: Record<string, unknown> = {},
    issuer = expected.issuer,
    audience = expected.audience
  ): Promise<string> {
    return new SignJWT({
      operationId: expected.operationId,
      requestId: expected.requestId,
      resourceScope: expected.resourceScope,
      runbookName: expected.runbookName,
      oneTimeUse: true,
      approvalProvenance: "synthetic-provenance",
      ...changes
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: "synthetic-phase-c-key"
      })
      .setIssuer(issuer)
      .setAudience(audience)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + 120)
      .sign(keys.privateKey);
  }

  const verified = await verifyPhaseCOperationCredential(
    await sign(), expected, resolver
  );

  assert.equal(verified.verified, true);
  assert.equal(verified.executionAuthorized, false);
  assert.equal(verified.retryAuthorized, false);
  assert.equal(verified.operationId, expected.operationId);
  assert.equal(verified.requestId, expected.requestId);
  console.log("PASS=SIGNED_CREDENTIAL_VERIFIED_NOT_AUTHORIZED");

  async function deny(
    token: string,
    configuration = expected
  ): Promise<void> {
    await assert.rejects(
      verifyPhaseCOperationCredential(
        token, configuration, resolver
      )
    );
  }

  await deny(await sign({
    operationId: randomUUID()
  }));
  console.log("PASS=OPERATION_MISMATCH_DENIED");

  await deny(await sign({
    requestId: randomUUID()
  }));
  console.log("PASS=REQUEST_MISMATCH_DENIED");

  await deny(await sign({
    resourceScope: "different-resource"
  }));
  console.log("PASS=RESOURCE_SCOPE_MISMATCH_DENIED");

  await deny(await sign({
    runbookName: "different-runbook"
  }));
  console.log("PASS=RUNBOOK_MISMATCH_DENIED");

  await deny(await sign({
    oneTimeUse: false
  }));
  console.log("PASS=ONE_TIME_CLAIM_REQUIRED");

  await deny(await sign({}, "https://wrong-issuer.invalid"));
  console.log("PASS=WRONG_ISSUER_DENIED");

  await deny(await sign({}, expected.issuer, "wrong-audience"));
  console.log("PASS=WRONG_AUDIENCE_DENIED");

  const otherKeys = await generateKeyPair("RS256");
  const forged = await new SignJWT({
    operationId: expected.operationId,
    requestId: expected.requestId,
    resourceScope: expected.resourceScope,
    runbookName: expected.runbookName,
    oneTimeUse: true,
    approvalProvenance: "synthetic-provenance"
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "synthetic-phase-c-key"
    })
    .setIssuer(expected.issuer)
    .setAudience(expected.audience)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 120)
    .sign(otherKeys.privateKey);

  await deny(forged);
  console.log("PASS=UNTRUSTED_SIGNING_KEY_DENIED");

  assert.equal(
    verified.executionAuthorized,
    false
  );
  console.log("PHASE_C_OPERATION_CREDENTIAL_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
