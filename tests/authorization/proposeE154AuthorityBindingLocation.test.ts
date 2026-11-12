import assert from "node:assert/strict";
import {
  E154_AUTHORITY_PARTITION,
  proposeE154AuthorityBindingLocation
} from "../../src/domain/staff/proposeE154AuthorityBindingLocation";

const tenant = "11111111-1111-4111-8111-111111111111";
const object = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const first = proposeE154AuthorityBindingLocation(tenant, object);
assert.ok(first);
assert.equal(first.partitionKey, E154_AUTHORITY_PARTITION);
assert.equal(first.rowKey, `binding-${tenant}-${object}`);

// Different claimant Staff IDs do not enter the key: one binding, one row.
const contender = proposeE154AuthorityBindingLocation(
  tenant.toUpperCase(), object.toUpperCase()
);
assert.deepEqual(contender, first);
assert.notEqual(
  proposeE154AuthorityBindingLocation(tenant, other)?.rowKey,
  first.rowKey
);
assert.notEqual(
  proposeE154AuthorityBindingLocation(other, object)?.rowKey,
  first.rowKey
);

for (const invalid of [
  ["", object], [tenant, ""], [tenant, "not-a-guid"],
  ["https://example.com", object], [tenant, object + "/suffix"],
  [null, object], [tenant, undefined], [123, object],
  [{ toString: () => { throw new Error("getter invoked"); } }, object]
] as const) {
  assert.equal(proposeE154AuthorityBindingLocation(invalid[0], invalid[1]), null);
}

assert.equal(first.authoritative, false);
assert.equal(first.storageConnectionPermitted, false);
assert.equal(first.writePermitted, false);
assert.equal(first.executionPermitted, false);
assert.equal(first.retryPermitted, false);
assert.ok(Object.isFrozen(first));

console.log("E154 canonical binding row-location non-authorizing regressions passed");
