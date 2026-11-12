/**
 * E149B: isolated synthetic conflict model, NOT a transaction or authorization port.
 * No Azure, StaffEvents, process env, Graph, tokens, or production data access.
 * A "would_serialize" verdict is hypothetical, never a write/claim permit.
 */
export type SyntheticAuthoritySnapshot = Readonly<{
  revision: number;
  generation: number;
  state: "active" | "revoked";
  bindingOwner: string | null;
  committedOperationIds: readonly string[];
}>;
export type SyntheticAuthorityAttempt = Readonly<{
  expectedRevision: number;
  expectedGeneration: number;
  operationId: string;
  staffId: string;
  action: "acquire_binding" | "revoke" | "claim";
}>;
export type SyntheticAuthorityOutcome = Readonly<{
  verdict: "would_serialize" | "conflict" | "invalid";
  reason:
    | "synthetic_predicates_match"
    | "stale_revision_or_generation"
    | "binding_owned_by_other_staff"
    | "revoked"
    | "duplicate_operation"
    | "invalid_evidence";
  nextSnapshot: SyntheticAuthoritySnapshot | null;
  authoritative: false;
  writePermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  migrationPermitted: false;
}>;

function own(value: object, key: string): unknown {
  const d = Object.getOwnPropertyDescriptor(value, key);
  return d && "value" in d ? d.value : undefined;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function revision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value < Number.MAX_SAFE_INTEGER - 1;
}
function id(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}
function outcome(
  verdict: SyntheticAuthorityOutcome["verdict"],
  reason: SyntheticAuthorityOutcome["reason"],
  nextSnapshot: SyntheticAuthoritySnapshot | null = null
): SyntheticAuthorityOutcome {
  return {
    verdict, reason, nextSnapshot,
    authoritative: false, writePermitted: false,
    executionPermitted: false, retryPermitted: false,
    migrationPermitted: false
  };
}

/**
 * Models one serialized authority-partition decision against a supplied
 * synthetic snapshot. The caller may pass a modeled nextSnapshot to the next
 * invocation to explore race ordering. This is not atomic storage behavior.
 */
export function modelSyntheticAuthorityConflict(
  snapshot: unknown,
  attempt: unknown
): SyntheticAuthorityOutcome {
  try {
    if (!record(snapshot) || !record(attempt)) {
      return outcome("invalid", "invalid_evidence");
    }
    const r = own(snapshot, "revision");
    const g = own(snapshot, "generation");
    const state = own(snapshot, "state");
    const owner = own(snapshot, "bindingOwner");
    const operations = own(snapshot, "committedOperationIds");
    const er = own(attempt, "expectedRevision");
    const eg = own(attempt, "expectedGeneration");
    const operationId = own(attempt, "operationId");
    const staffId = own(attempt, "staffId");
    const action = own(attempt, "action");

    if (!revision(r) || !revision(g) || !revision(er) || !revision(eg) ||
        (state !== "active" && state !== "revoked") ||
        (owner !== null && !id(owner)) || !Array.isArray(operations) ||
        !operations.every(id) || new Set(operations).size !== operations.length ||
        !id(operationId) || !id(staffId) ||
        (action !== "acquire_binding" && action !== "revoke" && action !== "claim")) {
      return outcome("invalid", "invalid_evidence");
    }
    if (operations.includes(operationId)) {
      return outcome("conflict", "duplicate_operation");
    }
    if (er !== r || eg !== g) {
      return outcome("conflict", "stale_revision_or_generation");
    }
    if (state === "revoked") {
      return outcome("conflict", "revoked");
    }
    if (action === "acquire_binding" && owner !== null && owner !== staffId) {
      return outcome("conflict", "binding_owned_by_other_staff");
    }
    if (action === "claim" && owner !== staffId) {
      return outcome("conflict", "binding_owned_by_other_staff");
    }
    const next: SyntheticAuthoritySnapshot = {
      revision: r + 1,
      generation: action === "revoke" ? g + 1 : g,
      state: action === "revoke" ? "revoked" : "active",
      bindingOwner: action === "acquire_binding" ? staffId : owner,
      committedOperationIds: [...operations, operationId]
    };
    return outcome("would_serialize", "synthetic_predicates_match", next);
  } catch {
    return outcome("invalid", "invalid_evidence");
  }
}
