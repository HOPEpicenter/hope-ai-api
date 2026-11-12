import assert from "node:assert/strict";
import {
  modelSyntheticAuthorityConflict,
  type SyntheticAuthoritySnapshot,
  type SyntheticAuthorityOutcome
} from "../../src/domain/staff/modelSyntheticAuthorityConflict";

const initial: SyntheticAuthoritySnapshot = {
  revision: 4,
  generation: 2,
  state: "active",
  bindingOwner: null,
  committedOperationIds: []
};
function attempt(staffId: string, operationId: string, action: "acquire_binding" | "revoke" | "claim" = "acquire_binding", revision = 4, generation = 2) {
  return { staffId, operationId, action, expectedRevision: revision, expectedGeneration: generation };
}
function deniedAuthority(r: SyntheticAuthorityOutcome): void {
  assert.equal(r.authoritative, false);
  assert.equal(r.writePermitted, false);
  assert.equal(r.executionPermitted, false);
  assert.equal(r.retryPermitted, false);
  assert.equal(r.migrationPermitted, false);
}
function modeled(r: SyntheticAuthorityOutcome): SyntheticAuthoritySnapshot {
  deniedAuthority(r);
  assert.equal(r.verdict, "would_serialize");
  assert.equal(r.reason, "synthetic_predicates_match");
  assert.ok(r.nextSnapshot);
  return r.nextSnapshot;
}
function rejected(r: SyntheticAuthorityOutcome, reason: SyntheticAuthorityOutcome["reason"]): void {
  deniedAuthority(r);
  assert.equal(r.reason, reason);
  assert.equal(r.nextSnapshot, null);
}

// Whichever contender is first, the other cannot claim the same binding.
// Both use the same synthetic authority partition and expected revision.
for (const [first, second] of [["staff-a", "staff-b"], ["staff-b", "staff-a"]]) {
  const after = modeled(modelSyntheticAuthorityConflict(initial, attempt(first, "op-first")));
  assert.equal(after.bindingOwner, first);
  rejected(modelSyntheticAuthorityConflict(after, attempt(second, "op-second")), "stale_revision_or_generation");
  rejected(modelSyntheticAuthorityConflict(after, attempt(second, "op-second", "acquire_binding", 5)), "binding_owned_by_other_staff");
  rejected(modelSyntheticAuthorityConflict(after, attempt(first, "op-first", "acquire_binding", 5)), "duplicate_operation");
}

// Non-owner cannot gain a claim even with a fresh revision.
const owned = modeled(modelSyntheticAuthorityConflict(initial, attempt("staff-a", "acquire")));
rejected(modelSyntheticAuthorityConflict(owned, attempt("staff-b", "claim-b", "claim", 5)), "binding_owned_by_other_staff");

// A serialized revocation increments generation; even a newly read revision
// and generation cannot turn the revoked snapshot into a claim.
const revoked = modeled(modelSyntheticAuthorityConflict(owned, attempt("staff-a", "revoke", "revoke", 5)));
assert.equal(revoked.state, "revoked");
assert.equal(revoked.generation, 3);
rejected(modelSyntheticAuthorityConflict(revoked, attempt("staff-a", "claim-stale", "claim", 5, 2)), "stale_revision_or_generation");
rejected(modelSyntheticAuthorityConflict(revoked, attempt("staff-a", "claim-fresh", "claim", 6, 3)), "revoked");

// No data is trusted as a permission: malformed and hostile inputs stay inert.
for (const value of [null, {}, { ...initial, revision: -1 }, { ...initial, committedOperationIds: ["dup", "dup"] }]) {
  rejected(modelSyntheticAuthorityConflict(value, attempt("staff-a", "op")), "invalid_evidence");
}
let getterInvoked = false;
const hostile = Object.defineProperty({}, "revision", { get() { getterInvoked = true; throw new Error("unsafe"); } });
rejected(modelSyntheticAuthorityConflict(hostile, attempt("staff-a", "op")), "invalid_evidence");
assert.equal(getterInvoked, false);
const proxy = Proxy.revocable({}, {});
proxy.revoke();
rejected(modelSyntheticAuthorityConflict(proxy.proxy, attempt("staff-a", "op")), "invalid_evidence");

console.log("E149B synthetic authority conflict regressions passed");
