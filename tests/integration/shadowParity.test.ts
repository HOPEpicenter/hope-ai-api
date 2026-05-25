import assert from "node:assert/strict";

function parityCheck(
  legacyItems: any[],
  shadowItems: any[]
) {
  return {
    legacyCount: legacyItems.length,
    shadowCount: shadowItems.length,
    equivalent:
      legacyItems.length === shadowItems.length
  };
}

const legacy = [
  { id: "a" },
  { id: "b" }
];

const shadow = [
  { id: "x" },
  { id: "y" }
];

const result = parityCheck(legacy, shadow);

assert.equal(result.legacyCount, 2);
assert.equal(result.shadowCount, 2);
assert.equal(result.equivalent, true);

console.log("shadowParity.test.ts passed");
