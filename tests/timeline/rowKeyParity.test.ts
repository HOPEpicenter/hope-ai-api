import assert from "node:assert/strict";

function compareRowKeyAscending(
  a: { rowKey: string },
  b: { rowKey: string }
): number {
  if (a.rowKey === b.rowKey) return 0;
  return a.rowKey < b.rowKey ? -1 : 1;
}

const items = [
  { rowKey: "9999999999997|evt-3" },
  { rowKey: "9999999999999|evt-1" },
  { rowKey: "9999999999998|evt-2" }
];

items.sort(compareRowKeyAscending);

assert.equal(items[0].rowKey.includes("evt-3"), true);
assert.equal(items[1].rowKey.includes("evt-2"), true);
assert.equal(items[2].rowKey.includes("evt-1"), true);

console.log("rowKeyParity.test.ts passed");
