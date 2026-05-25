import assert from "node:assert/strict";
import { normalizeIntegrationQuery }
from "../../src/shared/integration/normalizeIntegrationQuery";

const a = normalizeIntegrationQuery({
  limit: "9999",
  cursor: " abc ",
  debugShadow: "true"
});

assert.equal(a.limit, 200);
assert.equal(a.cursor, "abc");
assert.equal(a.debugShadow, true);

const b = normalizeIntegrationQuery({
  limit: "-1"
});

assert.equal(b.limit, 1);

console.log("normalizeIntegrationQuery.test.ts passed");
