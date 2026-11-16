"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

Module._extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  });
  module._compile(output.outputText, filename);
};

const {
  getKioskBootstrapOwnerAuthorizationConfiguration: read
} = require(path.resolve(
  process.cwd(),
  "src/config/kioskBootstrapOwnerAuthorization.ts"
));

const valid = () => ({
  FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION: "true",
  KIOSK_BOOTSTRAP_ENTRA_TENANT_ID:
    "783ef4b1-7e96-4a71-80dd-06865b015da9",
  KIOSK_BOOTSTRAP_OWNER_OBJECT_ID:
    "11111111-2222-4333-8444-555555555555",
  KIOSK_BOOTSTRAP_CLIENT_APPLICATION_ID:
    "22222222-3333-4444-8555-666666666666",
  KIOSK_BOOTSTRAP_API_AUDIENCE:
    "api://synthetic-kiosk-bootstrap",
  KIOSK_BOOTSTRAP_REQUIRED_SCOPE:
    "Kiosk.Bootstrap"
});

function disabled(result) {
  assert.equal(result.executionPermitted, false);
  assert.equal(result.staffCreationPermitted, false);
  assert.equal(result.approvalConsumptionPermitted, false);
}

function rejected(change) {
  assert.throws(
    () => read({ ...valid(), ...change }),
    /KIOSK_BOOTSTRAP_CONFIGURATION_INVALID/
  );
}

test("absent flag defaults off", () => {
  const result = read({});
  disabled(result);
  assert.equal(result.verificationConfigured, false);
});

test("explicit false remains off", () => {
  const result = read({
    ...valid(),
    FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION: "false"
  });
  disabled(result);
  assert.equal(result.verificationConfigured, false);
});

test("invalid flag fails closed", () => {
  rejected({
    FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION: "TRUE"
  });
});

test("complete synthetic configuration cannot authorize writes", () => {
  const result = read(valid());
  disabled(result);
  assert.equal(result.verificationConfigured, true);
  assert.equal(
    result.verificationConfiguration.requiredScope,
    "Kiosk.Bootstrap"
  );
  assert.equal(Object.isFrozen(result), true);
  assert.equal(
    Object.isFrozen(result.verificationConfiguration),
    true
  );
});

test("wrong tenant fails closed", () => {
  rejected({
    KIOSK_BOOTSTRAP_ENTRA_TENANT_ID:
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
  });
});

test("missing owner identity fails closed", () => {
  rejected({ KIOSK_BOOTSTRAP_OWNER_OBJECT_ID: "" });
});

test("missing client application fails closed", () => {
  rejected({ KIOSK_BOOTSTRAP_CLIENT_APPLICATION_ID: "" });
});

test("missing API audience fails closed", () => {
  rejected({ KIOSK_BOOTSTRAP_API_AUDIENCE: "" });
});

test("client application cannot be the audience", () => {
  rejected({
    KIOSK_BOOTSTRAP_API_AUDIENCE:
      "22222222-3333-4444-8555-666666666666"
  });
});

test("client application API URI cannot be the audience", () => {
  rejected({
    KIOSK_BOOTSTRAP_API_AUDIENCE:
      "api://22222222-3333-4444-8555-666666666666"
  });
});

test("missing permission fails closed", () => {
  rejected({ KIOSK_BOOTSTRAP_REQUIRED_SCOPE: "" });
});

test("malformed permission fails closed", () => {
  rejected({
    KIOSK_BOOTSTRAP_REQUIRED_SCOPE: "bad scope"
  });
});

test("existing Staff flags cannot enable bootstrap", () => {
  const result = read({
    FEATURE_ENTRA_ADMIN_AUTHORIZATION: "true",
    FEATURE_ENTRA_STAFF_ACTIVATION_AUTHORIZATION: "true"
  });
  disabled(result);
  assert.equal(result.verificationConfigured, false);
});