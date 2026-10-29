import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createFormationEventReadOnlyCredentialBoundary,
  FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY,
  FormationEventReadOnlyCredentialBoundaryUnavailableError
} from "../../src/services/formation/createFormationEventReadOnlyCredentialBoundary";

let passed = 0;
function test(name: string, run: () => void): void {
  run();
  passed++;
  console.log(`PASS ${name}`);
}

test("dedicated read-only credential readiness remains false", () => {
  assert.equal(FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY, false);
});

test("credential construction fails closed without returning a client", () => {
  assert.throws(
    () => createFormationEventReadOnlyCredentialBoundary(),
    error => {
      assert.ok(error instanceof FormationEventReadOnlyCredentialBoundaryUnavailableError);
      assert.equal(error.message, "A dedicated read-only FormationEvent storage credential is not configured");
      return true;
    }
  );
});

test("blocked boundary has no shared connection-string fallback or environment reads", () => {
  const sourcePath = path.resolve(
    __dirname,
    "../../src/services/formation/createFormationEventReadOnlyCredentialBoundary.ts"
  );
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.doesNotMatch(source, /\bprocess\.env\b/);
  assert.doesNotMatch(source, /getConnString|STORAGE_CONNECTION_STRING|AzureWebJobsStorage/);
  assert.doesNotMatch(source, /@azure\/data-tables|@azure\/identity|TableClient|TokenCredential/);
});

test("blocked boundary exposes no read or write storage operations", () => {
  assert.throws(
    () => createFormationEventReadOnlyCredentialBoundary(),
    FormationEventReadOnlyCredentialBoundaryUnavailableError
  );
  const sourcePath = path.resolve(
    __dirname,
    "../../src/services/formation/createFormationEventReadOnlyCredentialBoundary.ts"
  );
  const source = fs.readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /\b(?:create|upsert|delete|update)Entity\b/);
  assert.doesNotMatch(source, /\bsubmitTransaction\b|\bcreateTable\b/);
});

test("the unavailable error contains no credential or implementation detail", () => {
  const error = new FormationEventReadOnlyCredentialBoundaryUnavailableError();
  assert.doesNotMatch(error.message, /connection|string|credential value|token|secret/i);
});

console.log(`Passed ${passed} FormationEvent read-only credential boundary tests.`);
