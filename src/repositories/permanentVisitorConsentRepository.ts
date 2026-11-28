import { projectSixWeekVisitorFollowup } from "../domain/followups/projectSixWeekVisitorFollowup";

import { toSixWeekFollowupEventEntity, fromEntity } from "./sixWeekFollowupEventsRepository";
import {
  PUBLIC_VISITOR_SYSTEM_ORIGIN,
  type SixWeekFollowupEvent
} from "../domain/followups/projectSixWeekVisitorFollowup";
import type {
  RecordedPublicVisitEvidence,
  PublicVisitorEnrollmentResult
} from "../services/followups/enrollRecordedPublicVisitor";

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
  if (v.kind === "verified_staff_decision" && exact(v, ["kind", "expectedRevision", "decisionId", "pendingRequestId", "actorId", "decision"]) && revision(v.expectedRevision) && validId(v.decisionId) && (v.pendingRequestId === null || validId(v.pendingRequestId)) && validId(v.actorId) && (v.decision === "granted" || v.decision === "declined"))
    return { kind: v.kind, expectedRevision: v.expectedRevision, decisionId: v.decisionId, pendingRequestId: v.pendingRequestId, actorId: v.actorId, decision: v.decision };
  return null;
}
function initial(op: Operation): op is Initialization { return op.kind === "new_profile" || op.kind === "existing_profile"; }
function opId(op: Operation): string { return initial(op) ? op.evidenceId : op.kind === "public_request" ? op.requestId : op.decisionId; }


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
export function createPermanentVisitorConsentRepository(
  table: Port,
  sharedSixWeek = false
) {
  const namespace = sharedSixWeek ? "consent-v1:" : "";
  const HEAD = `${namespace}head`;
  const partition = (id: string) =>
    sharedSixWeek ? id : `consent-v1:${id}`;
  const key = (id: string) => `${namespace}op:${id}`;
  async function get<T extends object>(pk: string, rk: string) {
    try { return await table.getEntity<T>(pk, rk); }
    catch (e) { if (missing(e)) return null; throw e; }
  }
  async function empty(pk: string): Promise<boolean> {
    for await (const row of table.listEntities({ queryOptions: { filter: `PartitionKey eq '${pk}'`, select: ["RowKey"] } })) {
      if (!sharedSixWeek || row.rowKey?.startsWith(namespace)) return false;
    }
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
  // Internal read-only lookup for an immutable registration operation.
  // The returned revision is historical, never a current permission result.
  async function inspectOperation(visitorId: string, operationId: string) {
    try {
      if (!validId(visitorId) || !validId(operationId)) return { status: "unavailable" } as const;
      const pk = partition(visitorId);
      const stored = await receipt(pk, operationId);
      if (!stored) return { status: "not_found" } as const;
      const current = await head(pk);
      if (!current || current.state.revision < stored.after.revision ||
          (current.state.revision === stored.after.revision && current.lastOperationId !== operationId))
        return { status: "unavailable" } as const;
      return { status: "found", operation: stored.operation, revision: stored.after.revision } as const;
    } catch { return { status: "unavailable" } as const; }
  }
  // Inactive internal intent evidence, not an execution credential. The caller
  // must independently authenticate Staff and bind a canonical command digest.
  // No external writer is invoked by these methods.
  type ContactIntent = {
    operationId: string; actorId: string; expectedRevision: number;
    scope: "six_week" | "care" | "ministry_communication" | "staff_enrollment";
    commandDigest: string;
  };
  type ContactStatus = "current" | "recorded" | "replayed" | "not_found" |
    "stale" | "blocked" | "conflict" | "unavailable" | "invalid";
  type ContactResult = { status: ContactStatus };
  type ContactRow = { schemaVersion: 1; intentJson: string; consentOperationId: string; recordedAt: string };
  const result = (status: ContactStatus): ContactResult => ({ status });
  function contactInput(input: unknown): ContactIntent | null {
    const v = record(input);
    if (!v || !exact(v,["operationId","actorId","expectedRevision","scope","commandDigest"]) ||
        !validId(v.operationId) || !validId(v.actorId) || !revision(v.expectedRevision) ||
        (v.scope !== "six_week" && v.scope !== "care" && v.scope !== "ministry_communication" && v.scope !== "staff_enrollment") ||
        typeof v.commandDigest !== "string" || !/^[0-9a-f]{64}$/.test(v.commandDigest)) return null;
    return {operationId:v.operationId,actorId:v.actorId,expectedRevision:v.expectedRevision,scope:v.scope,commandDigest:v.commandDigest};
  }
  function contactPermitted(state: ConsentAuthority): boolean {
    return state.effective === "granted" && state.pending === null;
  }
  const contactKey = (id: string) => `${namespace}contact:${id}`;
  async function inspectContact(pk: string, intent: ContactIntent): Promise<ContactResult> {
    const row = await get<ContactRow>(pk, contactKey(intent.operationId));
    if (!row) return result("not_found");
    if (row.partitionKey !== pk || row.rowKey !== contactKey(intent.operationId) || row.schemaVersion !== 1 ||
        typeof row.intentJson !== "string" || row.intentJson.length > 4096 ||
        !validId(row.consentOperationId) || !validTime(row.recordedAt)) return result("unavailable");
    const stored = contactInput(JSON.parse(row.intentJson));
    if (!stored || stored.operationId !== intent.operationId || json(stored) !== row.intentJson) return result("unavailable");
    if (json(stored) !== json(intent)) return result("conflict");
    const anchor = await receipt(pk, row.consentOperationId);
    if (!anchor || anchor.after.revision !== intent.expectedRevision || !contactPermitted(anchor.after)) return result("unavailable");
    const current = await head(pk);
    if (!current || current.state.revision < intent.expectedRevision) return result("unavailable");
    if (current.state.revision !== intent.expectedRevision) return result("stale");
    if (current.lastOperationId !== row.consentOperationId || json(current.state) !== json(anchor.after)) return result("unavailable");
    return result(contactPermitted(current.state) ? "current" : "blocked");
  }
  /** Snapshot-only evidence. A current result is not a lease, a reusable
   * execution token, or proof that a separate storage mutation is safe. */
  async function inspectContactIntent(visitorId: string, input: unknown): Promise<ContactResult> {
    try {
      const intent = contactInput(input);
      if (!validId(visitorId) || !intent) return result("invalid");
      return await inspectContact(partition(visitorId),intent);
    } catch { return result("unavailable"); }
  }
  /** Atomically serialize intent creation against changes to the consent head.
   * Keep the logical consent revision and last consent operation unchanged.
   * Never rebase a stale request or treat historical replay as new authority. */
  async function recordContactIntent(visitorId: string, input: unknown): Promise<ContactResult> {
    try {
      const intent = contactInput(input);
      if (!validId(visitorId) || !intent) return result("invalid");
      const pk = partition(visitorId);
      const prior = await inspectContact(pk,intent);
      if (prior.status !== "not_found") return prior.status === "current" ? result("replayed") : prior;
      const current = await head(pk);
      if (!current) return result("unavailable");
      if (current.state.revision !== intent.expectedRevision) return result("stale");
      if (!contactPermitted(current.state)) return result("blocked");
      const unchanged = {partitionKey:pk,rowKey:HEAD,schemaVersion:1,stateJson:json(current.state),lastOperationId:current.lastOperationId};
      const evidence = {partitionKey:pk,rowKey:contactKey(intent.operationId),schemaVersion:1,intentJson:json(intent),consentOperationId:current.lastOperationId,recordedAt:new Date().toISOString()};
      let acknowledged = true;
      try { await table.submitTransaction([["update",unchanged,"Replace",{etag:current.etag}],["create",evidence]]); }
      catch { acknowledged = false; }
      const observed = await inspectContact(pk,intent);
      if (observed.status === "current") return result(acknowledged ? "recorded" : "replayed");
      if (observed.status !== "not_found") return observed;
      const latest = await head(pk);
      if (latest && latest.state.revision !== intent.expectedRevision) return result("stale");
      return result("unavailable");
    } catch { return result("unavailable"); }
  }
  /**
   * Trusted internal public enrollment only.
   * Consent and plan creation share one atomic transaction.
   * Historical intent evidence is never execution authority.
   */
  /**
   * Trusted Staff enrollment after existing actor,
   * visitor and assignee authorization.
   * Consent and plan creation commit together.
   */
  async function appendStaffEnrollment(
    event: SixWeekFollowupEvent
  ): Promise<"created" | "conflict" | "blocked" | "unavailable"> {
    try {
      if (!sharedSixWeek ||
          event.type !== "six_week_followup.plan_started" ||
          !validId(event.visitorId) ||
          !validId(event.eventId) ||
          !validId(event.actorId) ||
          event.actorId === PUBLIC_VISITOR_SYSTEM_ORIGIN ||
          !validTime(event.occurredAt) ||
          Object.keys(event.data).length !== 4 ||
          event.data.contactConsent !== true ||
          (event.data.ownerStaffId !== null &&
           !validId(event.data.ownerStaffId)) ||
          (event.data.preferredContactMethod !== null &&
           !["call", "email", "in_person", "none"].includes(
             String(event.data.preferredContactMethod)
           ))) {
        return "unavailable";
      }

      const firstVisitDate = event.data.firstVisitDate;

      if (typeof firstVisitDate !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(firstVisitDate)) {
        return "unavailable";
      }

      const parsed = new Date(`${firstVisitDate}T00:00:00.000Z`);

      if (!Number.isFinite(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== firstVisitDate) {
        return "unavailable";
      }

      const pk = partition(event.visitorId);
      const current = await head(pk);

      if (!current) return "unavailable";
      if (!contactPermitted(current.state)) return "blocked";

      const entity = toSixWeekFollowupEventEntity(event);

      if (await get<typeof entity>(pk, entity.rowKey)) {
        return "conflict";
      }

      const unchanged = {
        partitionKey: pk,
        rowKey: HEAD,
        schemaVersion: 1,
        stateJson: json(current.state),
        lastOperationId: current.lastOperationId
      };

      try {
        await table.submitTransaction([
          ["update", unchanged, "Replace", { etag: current.etag }],
          ["create", entity]
        ]);

        return "created";
      } catch {
        const observed = await head(pk);

        if (!observed) return "unavailable";
        if (!contactPermitted(observed.state)) return "blocked";

        const existing = await get<typeof entity>(pk, entity.rowKey);

        if (existing) {
          return existing.eventId === entity.eventId &&
            existing.visitorId === entity.visitorId &&
            existing.actorId === entity.actorId &&
            existing.type === entity.type &&
            existing.occurredAt === entity.occurredAt &&
            existing.dataJson === entity.dataJson
            ? "created" : "conflict";
        }

        return "unavailable";
      }
    } catch {
      return "unavailable";
    }
  }

  async function appendPublicEnrollment(
    evidence: RecordedPublicVisitEvidence,
    event: SixWeekFollowupEvent
  ): Promise<PublicVisitorEnrollmentResult> {
    try {
      if (!sharedSixWeek ||
          !validId(evidence.visitorId) ||
          !validId(evidence.submissionId) ||
          event.visitorId !== evidence.visitorId ||
          event.eventId !== `evt-public-${evidence.submissionId}` ||
          event.type !== "six_week_followup.plan_started" ||
          event.actorId !== PUBLIC_VISITOR_SYSTEM_ORIGIN ||
          event.data.firstVisitDate !== evidence.visitDate ||
          event.data.ownerStaffId !== null ||
          event.data.contactConsent !== true ||
          event.data.preferredContactMethod !== null ||
          !validTime(event.occurredAt)) {
        return "unavailable";
      }

      const pk = partition(evidence.visitorId);
      const initialGrant = await receipt(pk, evidence.submissionId);
      const current = await head(pk);

      if (!initialGrant || !current ||
          initialGrant.after.revision > current.state.revision) {
        return "unavailable";
      }

      if (initialGrant.operation.kind !== "new_profile" ||
          initialGrant.operation.initialConsent !== true ||
          !contactPermitted(current.state)) {
        return "not_eligible";
      }

      const unchanged = {
        partitionKey: pk,
        rowKey: HEAD,
        schemaVersion: 1,
        stateJson: json(current.state),
        lastOperationId: current.lastOperationId
      };

      const entity = toSixWeekFollowupEventEntity(event);

      try {
        await table.submitTransaction([
          ["update", unchanged, "Replace", { etag: current.etag }],
          ["create", entity]
        ]);

        return "enrolled";
      } catch {
        // Never automatically rebase after a consent conflict.
        const observed = await head(pk);

        if (!observed) return "unavailable";

        if (!contactPermitted(observed.state)) {
          return "not_eligible";
        }

        const existing = await get<typeof entity>(pk, entity.rowKey);

        if (existing &&
            existing.partitionKey === pk &&
            existing.rowKey === entity.rowKey &&
            existing.eventId === entity.eventId &&
            existing.visitorId === entity.visitorId &&
            existing.type === entity.type &&
            existing.actorId === entity.actorId &&
            existing.occurredAt === entity.occurredAt &&
            existing.dataJson === entity.dataJson) {
          return "existing";
        }

        return "unavailable";
      }
    } catch {
      return "unavailable";
    }
  }

  /**
   * A narrow trusted Staff operation, invoked only after
   * existing active actor and assignee authorization checks.
   *
   * No administrator override, generic writer exemption,
   * consent mutation or automatic communication occurs here.
   */
  async function appendStaffPlanMutation(
    event: SixWeekFollowupEvent,
    mode: "owner_claim" | "task_outcome" | "resume"
  ): Promise<"claimed" | "conflict" | "blocked" | "unavailable"> {
    try {
      if (!sharedSixWeek ||
          !validId(event.visitorId) ||
          !validId(event.eventId) ||
          !validId(event.actorId) ||
          event.actorId === PUBLIC_VISITOR_SYSTEM_ORIGIN ||
          !validTime(event.occurredAt)) {
        return "unavailable";
      }

      if (mode === "resume") {
        if (
          event.type !== "six_week_followup.plan_resumed" ||
          Object.keys(event.data).length !== 1 ||
          (event.data.reason !== null &&
            typeof event.data.reason !== "string")
        ) {
          return "unavailable";
        }
      } else if (mode === "owner_claim") {
        if (event.type !== "six_week_followup.owner_assigned" ||
            event.data.ownerStaffId !== event.actorId ||
            Object.keys(event.data).length !== 1) {
          return "unavailable";
        }
      } else {
        if ((event.type !== "six_week_followup.task_completed" &&
             event.type !== "six_week_followup.task_skipped") ||
            typeof event.data.weekNumber !== "number" ||
            !Number.isInteger(event.data.weekNumber) ||
            event.data.weekNumber < 1 ||
            event.data.weekNumber > 6 ||
            !["none", "call", "email", "in_person"].includes(
              String(event.data.contactMethod)
            ) ||
            (event.type === "six_week_followup.task_skipped" &&
              event.data.contactMethod !== "none") ||
            (event.type === "six_week_followup.task_completed" &&
              event.data.weekNumber === 6 &&
              event.data.contactMethod !== "none"
                ? event.data.careOutcome !== "connected" &&
                  event.data.careOutcome !== "closed"
                : event.data.careOutcome !== null) ||
            typeof event.data.outcome !== "string" ||
            !event.data.outcome.trim() ||
            event.data.outcome.length > 160 ||
            (event.data.notes !== null &&
              (typeof event.data.notes !== "string" ||
               event.data.notes.length > 2000)) ||
            Object.keys(event.data).length !== 5) {
          return "unavailable";
        }
      }

      const pk = partition(event.visitorId);
      const current = await head(pk);

      if (!current) return "unavailable";
      if (!contactPermitted(current.state)) return "blocked";

      type EventEntity = ReturnType<typeof toSixWeekFollowupEventEntity>;

      const start = await get<EventEntity>(
        pk, "0000__plan-started"
      );

      if (!start ||
          typeof start.etag !== "string" ||
          !start.etag ||
          start.etag === "*" ||
          start.type !== "six_week_followup.plan_started" ||
          start.visitorId !== event.visitorId) {
        return "unavailable";
      }

      const events: SixWeekFollowupEvent[] = [];

      for await (const row of table.listEntities<EventEntity>({
        queryOptions: { filter: `PartitionKey eq '${pk}'` }
      })) {
        if (row.rowKey?.startsWith(namespace)) continue;

        if (row.visitorId !== event.visitorId) {
          return "unavailable";
        }

        events.push(fromEntity(row));
      }

      const plan = projectSixWeekVisitorFollowup(events);

      if (!plan ||
          plan.status === "cancelled" ||
          plan.status === "completed") {
        return "conflict";
      }

      if (mode === "resume") {
        if (
          plan.status !== "paused" ||
          plan.ownerStaffId !== event.actorId
        ) {
          return "conflict";
        }
      } else if (mode === "owner_claim") {
        if (plan.ownerStaffId) return "conflict";
      } else {
        if (plan.status !== "active" ||
            plan.ownerStaffId !== event.actorId) {
          return "conflict";
        }

        const task = plan.tasks.find(
          item => item.weekNumber === event.data.weekNumber
        );

        if (!task ||
            task.status === "completed" ||
            task.status === "skipped") {
          return "conflict";
        }
      }

      const unchangedConsent = {
        partitionKey: pk,
        rowKey: HEAD,
        schemaVersion: 1,
        stateJson: json(current.state),
        lastOperationId: current.lastOperationId
      };

      try {
        await table.submitTransaction([
          ["update", unchangedConsent,
            "Replace", { etag: current.etag }],
          ["update", toSixWeekFollowupEventEntity(fromEntity(start)),
            "Replace", { etag: start.etag }],
          ["create", toSixWeekFollowupEventEntity(event)]
        ]);

        return "claimed";
      } catch (error) {
        // Never silently rebase a claim against newer consent
        // or a changed plan.
        const status = (error as { statusCode?: number })?.statusCode;

        if (status === 409 || status === 412) return "conflict";

        return "unavailable";
      }
    } catch {
      return "unavailable";
    }
  }

  async function appendStaffOwnerClaim(event: SixWeekFollowupEvent) {
    return appendStaffPlanMutation(event, "owner_claim");
  }

  async function appendStaffTaskOutcome(
    event: SixWeekFollowupEvent
  ): Promise<"recorded" | "conflict" | "blocked" | "unavailable"> {
    const result = await appendStaffPlanMutation(
      event, "task_outcome"
    );

    return result === "claimed" ? "recorded" : result;
  }

  async function appendStaffPlanResume(
    event: SixWeekFollowupEvent
  ): Promise<"recorded" | "conflict" | "blocked" | "unavailable"> {
    const result = await appendStaffPlanMutation(event, "resume");
    return result === "claimed" ? "recorded" : result;
  }

  return {
    read, apply, inspectOperation,
    recordContactIntent, inspectContactIntent,
    appendPublicEnrollment,
    appendStaffEnrollment,
    appendStaffOwnerClaim,
    appendStaffTaskOutcome,
    appendStaffPlanResume
  };
}
