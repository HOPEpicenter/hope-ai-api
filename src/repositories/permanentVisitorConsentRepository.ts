import type { TableClient, TransactionAction } from "@azure/data-tables";
import {
  initializeConsentAuthority, isConsentAuthority, transitionConsentAuthority,
  type ConsentAuthority, type ConsentCommand
} from "../domain/followups/permanentVisitorConsentAuthority";

// Inactive, injected storage only. No table creation, environment lookup,
// identity authentication, runtime wiring or communication delivery.
type Port = Pick<TableClient, "getEntity" | "listEntities" | "submitTransaction">;
type Initialization =
  | { kind: "new_profile"; evidenceId: string; initialConsent: boolean }
  | { kind: "existing_profile"; evidenceId: string };
type Operation = Initialization | ConsentCommand;
type ApplyResult =
  | { status: "committed" | "replayed"; revision: number }
  | { status: "rejected"; reason: "invalid_command" | "conflict" | "stale_revision" | "unavailable" | "transition_rejected" };
export type ConsentAuthorityRead =
  | { status: "ready"; state: ConsentAuthority }
  | { status: "not_initialized" | "unavailable" };
type Receipt = {
  schemaVersion: 1; operationJson: string; beforeJson: string;
  afterJson: string; recordedAt: string;
};
type Head = { schemaVersion: 1; stateJson: string; lastOperationId: string };
type LoadedHead = { state: ConsentAuthority; etag: string; lastOperationId: string };
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEAD = "head";
function validId(v: unknown): v is string { return typeof v === "string" && ID.test(v); }
function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function exact(v: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
}
function revision(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 1; }
function normalize(input: unknown): Operation | null {
  const v = record(input);
  if (!v) return null;
  if (v.kind === "new_profile" && exact(v, ["kind", "evidenceId", "initialConsent"]) && validId(v.evidenceId) && typeof v.initialConsent === "boolean")
    return { kind: v.kind, evidenceId: v.evidenceId, initialConsent: v.initialConsent };
  if (v.kind === "existing_profile" && exact(v, ["kind", "evidenceId"]) && validId(v.evidenceId))
    return { kind: v.kind, evidenceId: v.evidenceId };
  if (v.kind === "public_request" && exact(v, ["kind", "expectedRevision", "requestId", "requestedConsent"]) && revision(v.expectedRevision) && validId(v.requestId) && typeof v.requestedConsent === "boolean")
    return { kind: v.kind, expectedRevision: v.expectedRevision, requestId: v.requestId, requestedConsent: v.requestedConsent };
  if (v.kind === "verified_staff_decision" && exact(v, ["kind", "expectedRevision", "decisionId", "pendingRequestId", "actorId", "decision"]) && revision(v.expectedRevision) && validId(v.decisionId) && validId(v.pendingRequestId) && validId(v.actorId) && (v.decision === "granted" || v.decision === "declined"))
    return { kind: v.kind, expectedRevision: v.expectedRevision, decisionId: v.decisionId, pendingRequestId: v.pendingRequestId, actorId: v.actorId, decision: v.decision };
  return null;
}
function initial(op: Operation): op is Initialization { return op.kind === "new_profile" || op.kind === "existing_profile"; }
function opId(op: Operation): string { return initial(op) ? op.evidenceId : op.kind === "public_request" ? op.requestId : op.decisionId; }
function partition(id: string): string { return `consent-v1:${id}`; }
function key(id: string): string { return `op:${id}`; }
function json(v: unknown): string { return JSON.stringify(v); }
function parseState(v: unknown): ConsentAuthority {
  if (typeof v !== "string" || v.length > 4096) throw new Error("Invalid consent state encoding");
  const state: unknown = JSON.parse(v);
  if (!isConsentAuthority(state)) throw new Error("Invalid consent state");
  return state;
}
function nextState(before: ConsentAuthority | null, op: Operation): ConsentAuthority | null {
  if (initial(op)) return before === null ? initializeConsentAuthority(op) : null;
  if (!before || before.revision === Number.MAX_SAFE_INTEGER) return null;
  const result = transitionConsentAuthority(before, op);
  if (result.status === "rejected") return null;
  // Every distinct accepted operation advances the durable revision, even
  // a semantic no-op. A fresh withdrawal replaces the pending reference,
  // so an older verification cannot release a newer withdrawal request.
  if (op.kind === "public_request" && !op.requestedConsent && result.state.pending?.kind === "withdrawal") {
    return { ...result.state, revision: before.revision + 1,
      pending: { kind: "withdrawal", requestId: op.requestId }, evidenceId: op.requestId };
  }
  return { ...result.state, revision: before.revision + 1 };
}
function missing(error: unknown): boolean {
  const e = error as { statusCode?: number; code?: string; details?: { errorCode?: string; odataError?: { code?: string } } } | null;
  if (e?.statusCode !== 404) return false;
  const codes = [e.code, e.details?.errorCode, e.details?.odataError?.code].filter(c => c !== undefined);
  return codes.length > 0 && codes.every(c => c === "ResourceNotFound" || c === "EntityNotFound");
}
function validTime(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function rejected(reason: Extract<ApplyResult, {status: "rejected"}>["reason"]): ApplyResult { return { status: "rejected", reason }; }

/** Trusted internal adapter only. Staff verification and new-profile ownership
 * are NOT established by this repository. No public inputs may call it directly.
 * An operation ID is unique per visitor across all command kinds. Retry the
 * exact command; never rewrite expectedRevision of a committed operation.
 */
export function createPermanentVisitorConsentRepository(table: Port) {
  async function get<T extends object>(pk: string, rk: string) {
    try { return await table.getEntity<T>(pk, rk); }
    catch (e) { if (missing(e)) return null; throw e; }
  }
  async function empty(pk: string): Promise<boolean> {
    for await (const _ of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${pk}'`, select: ["RowKey"] } })) return false;
    return true;
  }
  async function receipt(pk: string, id: string): Promise<{ operation: Operation; before: ConsentAuthority | null; after: ConsentAuthority } | null> {
    const row = await get<Receipt>(pk, key(id));
    if (!row) return null;
    if (row.partitionKey !== pk || row.rowKey !== key(id) || row.schemaVersion !== 1 ||
        typeof row.operationJson !== "string" || row.operationJson.length > 4096 || !validTime(row.recordedAt)) throw new Error("Invalid consent receipt");
    const operation = normalize(JSON.parse(row.operationJson));
    if (!operation || opId(operation) !== id || json(operation) !== row.operationJson) throw new Error("Invalid consent operation");
    const before = row.beforeJson === "" ? null : parseState(row.beforeJson);
    const after = parseState(row.afterJson);
    const expected = nextState(before, operation);
    if (!expected || json(expected) !== row.afterJson) throw new Error("Invalid consent transition receipt");
    return { operation, before, after };
  }
  async function head(pk: string): Promise<LoadedHead | null> {
    const row = await get<Head>(pk, HEAD);
    if (!row) return null;
    if (row.partitionKey !== pk || row.rowKey !== HEAD || row.schemaVersion !== 1 || !validId(row.lastOperationId) ||
        typeof row.etag !== "string" || !row.etag.trim() || row.etag.trim() === "*" || row.etag.trim() !== row.etag) throw new Error("Invalid consent head");
    const state = parseState(row.stateJson);
    const last = await receipt(pk, row.lastOperationId);
    if (!last || json(last.after) !== row.stateJson) throw new Error("Consent head lacks matching receipt");
    return { state, etag: row.etag, lastOperationId: row.lastOperationId };
  }
  async function read(visitorId: string): Promise<ConsentAuthorityRead> {
    try {
      if (!validId(visitorId)) return { status: "unavailable" };
      const pk = partition(visitorId);
      const current = await head(pk);
      if (current) return { status: "ready", state: current.state };
      return { status: await empty(pk) ? "not_initialized" : "unavailable" };
    } catch { return { status: "unavailable" }; }
  }
  async function reconcile(pk: string, operation: Operation, status: "committed" | "replayed"): Promise<ApplyResult | null> {
    const stored = await receipt(pk, opId(operation));
    if (!stored) return null;
    if (json(stored.operation) !== json(operation)) return rejected("conflict");
    const current = await head(pk);
    if (!current || current.state.revision < stored.after.revision ||
        (current.state.revision === stored.after.revision && current.lastOperationId !== opId(operation))) return rejected("unavailable");
    // Only historical operation outcome, never a current eligibility assertion.
    return { status, revision: stored.after.revision };
  }
  async function apply(visitorId: string, input: unknown): Promise<ApplyResult> {
    try {
      const op = normalize(input);
      if (!validId(visitorId) || !op) return rejected("invalid_command");
      const pk = partition(visitorId);
      const prior = await reconcile(pk, op, "replayed");
      if (prior) return prior;
      const current = await head(pk);
      if (initial(op)) {
        if (current) return rejected("conflict");
        if (!(await empty(pk))) return rejected("unavailable");
      } else {
        if (!current) return rejected("unavailable");
        if (op.expectedRevision !== current.state.revision) return rejected("stale_revision");
      }
      const next = nextState(current?.state ?? null, op);
      if (!next) return rejected("transition_rejected");
      const id = opId(op);
      const headRow = { partitionKey: pk, rowKey: HEAD, schemaVersion: 1, stateJson: json(next), lastOperationId: id };
      const receiptRow = { partitionKey: pk, rowKey: key(id), schemaVersion: 1, operationJson: json(op), beforeJson: current ? json(current.state) : "", afterJson: json(next), recordedAt: new Date().toISOString() };
      const actions: TransactionAction[] = [
        current ? ["update", headRow, "Replace", { etag: current.etag }] : ["create", headRow],
        ["create", receiptRow]
      ];
      let acknowledged = true;
      try { await table.submitTransaction(actions); }
      catch { acknowledged = false; }
      const confirmed = await reconcile(pk, op, acknowledged ? "committed" : "replayed");
      if (confirmed) return confirmed;
      // No automatic rebase or second write. Caller must inspect/reconcile.
      const observed = await head(pk);
      if (observed && !initial(op) && observed.state.revision !== op.expectedRevision) return rejected("stale_revision");
      return rejected("unavailable");
    } catch { return rejected("unavailable"); }
  }
  return { read, apply };
}
