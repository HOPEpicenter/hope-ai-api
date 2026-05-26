import assert from "node:assert/strict";

import {
  isDiagnosticProjectionSource
} from "../../src/shared/integration/isDiagnosticProjectionSource";

assert.equal(
  isDiagnosticProjectionSource("scripts/rebuild"),
  true
);

assert.equal(
  isDiagnosticProjectionSource("runtime/assertion"),
  true
);

assert.equal(
  isDiagnosticProjectionSource("dashboard"),
  false
);

assert.equal(
  isDiagnosticProjectionSource(null),
  false
);

console.log(
  "isDiagnosticProjectionSource.test.ts passed"
);