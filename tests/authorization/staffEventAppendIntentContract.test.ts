import assert from "node:assert/strict";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";
import {
  STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
  STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
  type StaffEventCorrelationEvidenceV1
} from "../../src/contracts/staffEventCorrelationEvidence.v1";
import {
  STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION,
  STAFF_EVENT_APPEND_INTENT_SOURCE,
  validateStaffEventAppendIntent,
  type StaffEventAppendIntentOperation
} from "../../src/contracts/staffEventAppendIntent.v1";

function event(changes: Partial<StaffEvent> = {}): StaffEvent {
  return {
    eventId: "event-synthetic-intent",
    staffId: "staff-synthetic-intent",
    type: "staff.updated",
    occurredAt: "2026-10-14T12:00:00.000Z",
    actorId: "actor-synthetic",
    data: { displayName: "Synthetic Staff" },
    ...changes
  };
}

function correlation(
  changes: Partial<StaffEventCorrelationEvidenceV1> = {}
): StaffEventCorrelationEvidenceV1 {
  return {
    schemaVersion: STAFF_EVENT_CORRELATION_EVIDENCE_SCHEMA_VERSION,
    sourceIdentity: STAFF_EVENT_CORRELATION_EVIDENCE_SOURCE,
    evidenceProvenance: "writer_supplied_metadata",
    operationId: "operation-synthetic-intent",
    eventId: "event-synthetic-intent",
    staffId: "staff-synthetic-intent",
    mutationCategory: "profile_update",
    expectedSecurityRevision: 1,
    resultingSecurityRevision: 2,
    previousStaffState: "active",
    resultingStaffState: "active",
    ...changes
  };
}

function intent(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: STAFF_EVENT_APPEND_INTENT_SCHEMA_VERSION,
    sourceIdentity: STAFF_EVENT_APPEND_INTENT_SOURCE,
    event: event(),
    correlation: correlation(),
    ...changes
  };
}

const operation: StaffEventAppendIntentOperation = {
  operationId: "operation-synthetic-intent",
  eventId: "event-synthetic-intent",
  staffId: "staff-synthetic-intent",
  mutationCategory: "profile_update",
  resultingSecurityRevision: 2
};

function check(input: unknown, op: StaffEventAppendIntentOperation = operation) {
  const r = validateStaffEventAppendIntent(input, op);
  assert.equal(r.authoritative, false);
  assert.equal(r.executionPermitted, false);
  assert.equal(r.retryPermitted, false);
  assert.equal(r.securityTransactionVerified, false);
  assert.equal(r.staffEventsAppendVerified, false);
  if (r.status !== "valid") assert.equal(r.intent, undefined);
  return r;
}

// Valid intent preserves the canonical event exactly.
const input = intent();
const before = JSON.stringify(input);
const valid = check(input);
assert.equal(valid.status, "valid");
assert.deepEqual(valid.intent?.event, event());
assert.equal(valid.intent?.correlation.operationId, operation.operationId);
assert.equal(JSON.stringify(input), before);

// Immutable handling: detached, frozen output; later input changes are ignored.
assert.notEqual(valid.intent?.event, (input as { event: StaffEvent }).event);
assert.ok(Object.isFrozen(valid.intent));
assert.ok(Object.isFrozen(valid.intent?.event));
assert.ok(Object.isFrozen(valid.intent?.event.data));
(input as { event: StaffEvent }).event.actorId = "changed-later";
assert.equal(valid.intent?.event.actorId, "actor-synthetic");
assert.throws(() => {
  "use strict";
  (valid.intent as { event: StaffEvent }).event.eventId = "x";
});

// Identity, category, and revision mismatch against the operation.
for (const changes of [
  { operationId: "other-op" },
  { eventId: "other-event" },
  { staffId: "other-staff" },
  { mutationCategory: "status_transition" as const },
  { resultingSecurityRevision: 3 }
]) {
  assert.equal(check(intent(), { ...operation, ...changes }).status, "contradictory");
}
assert.equal(check(intent({ event: event({ eventId: "other-event" }) })).status, "contradictory");
assert.equal(check(intent({ event: event({ staffId: "other-staff" }) })).status, "contradictory");
assert.equal(check(intent({ event: event({ type: "staff.deactivated" }) })).status, "contradictory");

// Unsupported schema and malformed envelope.
assert.equal(check(intent({ schemaVersion: 2 })).status, "unsupported_schema_version");
assert.equal(check(intent({ schemaVersion: undefined })).status, "malformed");
assert.equal(check(intent({ sourceIdentity: "other" })).status, "malformed");
assert.equal(check(intent({ extra: true })).status, "malformed");
for (const bad of [null, undefined, "x", 1, [], () => 1]) {
  assert.equal(check(bad).status, "malformed");
}

// Invalid event fields; nothing is inferred or defaulted.
for (const changes of [
  { eventId: "bad id!" },
  { staffId: "" },
  { type: "staff.unknown" },
  { occurredAt: "not-a-date" },
  { occurredAt: undefined },
  { actorId: "   " },
  { actorId: undefined }
]) {
  const r = check(intent({ event: { ...event(), ...changes } }));
  assert.notEqual(r.status, "valid", JSON.stringify(changes));
}
const { actorId: _omitted, ...noActor } = event();
assert.equal(check(intent({ event: noActor })).status, "malformed");
assert.equal(check(intent({ event: { ...event(), extra: 1 } })).status, "malformed");
assert.equal(check(intent({ event: null })).status, "malformed");
assert.equal(check(intent({ event: { ...event(), data: null } })).status, "malformed");

// Invalid correlation.
assert.equal(check(intent({ correlation: null })).status, "malformed");
assert.equal(check(intent({ correlation: { ...correlation(), schemaVersion: 2 } })).status, "unsupported_schema_version");
assert.equal(check(intent({ correlation: correlation({ resultingSecurityRevision: 5 }) }), { ...operation, resultingSecurityRevision: 5 }).status, "contradictory");
assert.equal(check(intent({ correlation: correlation({ operationId: "bad id!" }) })).status, "malformed");
assert.equal(check(intent({ correlation: { ...correlation(), extra: 1 } })).status, "malformed");

// Malformed and non-serializable payloads.
assert.equal(check(intent({ event: event({ data: { displayName: 1 } as never }) })).status, "malformed");
assert.equal(check(intent({ event: event({ data: { unknown: "x" } as never }) })).status, "malformed");
assert.equal(check(intent({ event: event({ data: { displayName: undefined } as never }) })).status, "malformed");
assert.equal(check(intent({ event: event({ data: { displayName: 10n } as never }) })).status, "malformed");
assert.equal(check(intent({ event: Object.create({ inherited: 1 }) })).status, "malformed");
const circular: Record<string, unknown> = { ...correlation() };
circular.self = circular;
assert.equal(check(intent({ correlation: circular })).status, "malformed");

// Entity-size bound.
assert.equal(
  check(intent({ event: event({ data: { displayName: "x".repeat(40000) } }) })).status,
  "oversized"
);

// Hostile inputs never throw and are always rejected as malformed without leaks.
const secret = "SECRET-PAYLOAD-MARKER";
function hostile(label: string, input: unknown, op = operation): void {
  let r;
  assert.doesNotThrow(() => { r = check(input, op); }, label);
  const res = r as unknown as ReturnType<typeof check>;
  assert.equal(res.status, "malformed", label);
  assert.equal(res.intent, undefined, label);
  assert.ok(!JSON.stringify(res).includes(secret), label);
  assert.ok(!JSON.stringify(res).includes("boom"), label);
}
const revoked = Proxy.revocable({}, {});
revoked.revoke();
hostile("revoked proxy envelope", revoked.proxy);
hostile("revoked proxy event", intent({ event: revoked.proxy }));
hostile("revoked proxy correlation", intent({ correlation: revoked.proxy }));
hostile("revoked proxy operation", intent(), revoked.proxy as never);
const throwingTrap = (): never => { throw new Error("boom " + secret); };
for (const trap of ["ownKeys", "getOwnPropertyDescriptor", "get", "getPrototypeOf", "has"]) {
  const proxy = new Proxy({ ...event() }, { [trap]: throwingTrap });
  hostile(`throwing ${trap} trap`, intent({ event: proxy }));
  // Even a well-behaved proxy is unsupported.
  hostile("plain proxy", intent({ event: new Proxy({ ...event() }, {}) }));
}
const getterEvent = { ...event() };
Object.defineProperty(getterEvent, "actorId", { enumerable: true, get() { throw new Error("boom " + secret); } });
hostile("throwing getter", intent({ event: getterEvent }));
const flipping = { ...event() } as Record<string, unknown>;
let reads = 0;
Object.defineProperty(flipping, "actorId", { enumerable: true, get() { return ++reads === 1 ? "a1" : "a2"; } });
hostile("successive-read accessor", intent({ event: flipping }));
assert.equal(reads, 0);
const dataGetter = { displayName: "x" };
Object.defineProperty(dataGetter, "email", { enumerable: true, get: () => secret });
hostile("accessor in event data", intent({ event: event({ data: dataGetter }) }));
hostile("toJSON on event", intent({ event: { ...event(), toJSON: () => ({ secret }) } }));
hostile("toJSON on correlation", intent({ correlation: { ...correlation(), toJSON: () => ({ secret }) } }));
hostile("toJSON on data", intent({ event: event({ data: { toJSON: () => secret } as never }) }));
hostile("toJSON on envelope", intent({ toJSON: () => secret }));
hostile("non-enumerable own field", intent({ event: Object.defineProperty({ ...event() }, "hidden", { value: secret, enumerable: false }) }));
hostile("symbol key", intent({ event: { ...event(), [Symbol("s")]: secret } }));
hostile("array in data", intent({ event: event({ data: { displayName: [secret] } as never }) }));
hostile("class instance", intent({ event: new (class { eventId = "x"; })() }));
hostile("non-finite revision", intent({ correlation: correlation({ resultingSecurityRevision: Infinity }) }));
hostile("operation getter", intent(), Object.defineProperty({ ...operation }, "operationId", { enumerable: true, get() { throw new Error("boom"); } }) as never);
hostile("too deep", intent({ correlation: { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } } }));
const deepSelf: Record<string, unknown> = {};
deepSelf.self = deepSelf;
hostile("cyclic", intent({ event: deepSelf }));

// Explicit undefined is rejected rather than silently dropped by JSON.
hostile("nested undefined in correlation", intent({ correlation: { ...correlation(), binding: { identity: { entraTenantId: undefined } } } }));
hostile("undefined optional correlation field", intent({ correlation: { ...correlation(), binding: undefined } }));
hostile("undefined in operation", intent(), { ...operation, mutationCategory: undefined } as never);
assert.equal(validateStaffEventAppendIntent(intent(), undefined as never).status, "malformed");

// null in permitted optional event data fields remains supported.
const nullData = check(intent({ event: event({ data: { displayName: "Synthetic Staff", roleLabel: null, reason: null, email: null, phone: null, ministryAreaId: null } }) }));
assert.equal(nullData.status, "valid");
assert.equal(nullData.intent?.event.data.email, null);

// JSON-parsed records (null-prototype objects included) remain valid.
assert.equal(check(JSON.parse(JSON.stringify(intent()))).status, "valid");
const nullProto = Object.assign(Object.create(null), event());
nullProto.data = Object.assign(Object.create(null), { displayName: "Synthetic Staff" });
assert.equal(check(intent({ event: nullProto })).status, "valid");
// Caller input is never mutated by hostile or valid validation.
const frozenInput = JSON.parse(JSON.stringify(intent()));
const frozenBefore = JSON.stringify(frozenInput);
check(frozenInput);
assert.equal(JSON.stringify(frozenInput), frozenBefore);

console.log("[PASS] StaffEvents append intent contract v1 proof");
