import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import { getPermanentVisitRecovery as handle } from "../../src/functions/getPermanentVisitRecovery";
import type { PermanentVisitRecoveryInspection } from "../../src/services/visitors/inspectPermanentVisitRecovery";

type Deps = NonNullable<Parameters<typeof handle>[2]>;
const id = "11111111-1111-4111-8111-111111111111";
const actor = "synthetic-admin-111";
const key = "synthetic-admin-key-111";
const staffKey = "synthetic-staff-key-111";
const bridge = "synthetic-bridge-key-111";
const flag = "FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION";
const stamp = "2026-11-24T19:00:00.000Z";
const staff: CanonicalStaffIdentity = { staffId: actor, displayName: "Synthetic Admin", roleLabel: "Pastor", status: "active", createdAt: stamp, updatedAt: stamp, lastEventId: "synthetic-event", entraTenantId: null, entraObjectId: null, email: null, phone: null, ministryAreaId: null };
const ready = { status: "ready", submissionId: id, serviceId: "visit-2026-11-24", visitDate: "2026-11-24", stage: "completed", familyExpected: true, followupExpected: true, adultRecorded: true, familyRecorded: true } as const;
function req(headers: Record<string,string> = { "x-admin-api-key": key, "x-hope-admin-actor-id": actor }, submissionId = id, method = "GET") {
  return { headers, params: { submissionId }, method };
}
function fixture(overrides: Deps = {}) {
  const calls = { staff: 0, inspect: 0 };
  const deps: Deps = {
    readStaff: async value => { calls.staff++; assert.equal(value, actor); return staff; },
    inspect: async value => { calls.inspect++; assert.equal(value, id); return ready; },
    ...overrides
  };
  return { calls, deps };
}
async function run(request: ReturnType<typeof req>, deps: Deps, changes: Record<string,string|undefined> = {}) {
  const values = { [flag]: "true", HOPE_ADMIN_API_KEY: key, HOPE_ADMIN_STAFF_IDS: actor, HOPE_API_KEY: staffKey, HOPE_PERMANENT_VISIT_BRIDGE_KEY: bridge, ...changes };
  const old = new Map<string,string|undefined>();
  for (const [name,value] of Object.entries(values)) { old.set(name,process.env[name]); if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  try {
    const context: any = {};
    await handle(context, request, deps);
    assert.equal(context.res.headers["cache-control"], "no-store");
    return context.res;
  } finally { for (const [name,value] of old) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
}
test("recovery feature default off prevents staff and storage reads", async () => {
  for (const value of [undefined, "false", "TRUE", ""]) {
    const f = fixture(); assert.equal((await run(req(), f.deps, {[flag]:value})).status, 404);
    assert.deepEqual(f.calls,{staff:0,inspect:0});
  }
});
test("ordinary and public credentials cannot authorize recovery even in admin header", async () => {
  const candidates: Record<string,string>[] = [{}, {"x-api-key":staffKey,"x-hope-staff-actor-id":actor}, {"x-hope-public-visit-key":bridge}, {"x-admin-api-key":staffKey,"x-hope-admin-actor-id":actor}, {"x-admin-api-key":bridge,"x-hope-admin-actor-id":actor}];
  for (const headers of candidates) { const f=fixture(); assert.equal((await run(req(headers), f.deps)).status,401); assert.deepEqual(f.calls,{staff:0,inspect:0}); }
});
test("missing unconfigured unknown or inactive administrator is denied", async () => {
  const f=fixture();
  assert.equal((await run(req({"x-admin-api-key":key}), f.deps)).status,401);
  assert.equal((await run(req({"x-admin-api-key":key,"x-hope-admin-actor-id":"ordinary"}), f.deps)).status,403);
  assert.deepEqual(f.calls,{staff:0,inspect:0});
  for (const identity of [null, {...staff,status:"inactive" as const}]) {
    const rejected=fixture({readStaff:async()=>identity}); assert.equal((await run(req(),rejected.deps)).status,403); assert.equal(rejected.calls.inspect,0);
  }
});
test("shared admin credential configuration fails closed", async () => {
  for (const name of ["HOPE_API_KEY","HOPE_PERMANENT_VISIT_BRIDGE_KEY"]) { const f=fixture(); assert.equal((await run(req(),f.deps,{[name]:key})).status,503); assert.deepEqual(f.calls,{staff:0,inspect:0}); }
});
test("invalid method and submission identifier cannot reach inspection", async () => {
  const f=fixture(); assert.equal((await run(req(undefined,id,"POST"),f.deps)).status,405);
  for (const invalid of ["bad", "11111111-1111-1111-8111-111111111111", "' or '1' eq '1"]) assert.equal((await run(req(undefined,invalid),f.deps)).status,400);
  assert.equal(f.calls.inspect,0);
});
test("administrator sees only exact minimal recovery contract for every valid stage", async () => {
  const samples: PermanentVisitRecoveryInspection[] = [
    {...ready,stage:"awaiting_arrival_claim",adultRecorded:false,familyRecorded:false},
    {...ready,stage:"adult_attendance_unconfirmed",adultRecorded:false,familyRecorded:false},
    {...ready,stage:"family_attendance_unconfirmed",familyRecorded:false},
    {...ready,stage:"completion_unconfirmed"},ready,{...ready,familyExpected:false,familyRecorded:false}
  ];
  for (const sample of samples) {
    const f=fixture({inspect:async()=>({...sample,secret:"DO NOT EXPOSE",childName:"Synthetic Child"})});
    const response=await run(req(),f.deps); assert.equal(response.status,200); assert.deepEqual(response.body,{ok:true,recovery:sample});
  }
});
test("untracked recovery is explicitly not found", async () => {
  const f=fixture({inspect:async()=>({status:"not_tracked"})});
  assert.deepEqual((await run(req(),f.deps)).body,{ok:false,error:"RECOVERY_NOT_TRACKED"});
  assert.equal((await run(req(),f.deps)).status,404);
});
test("wrong submission inconsistent state and storage failure fail closed", async () => {
  const invalid: PermanentVisitRecoveryInspection[] = [{status:"unavailable"},{...ready,submissionId:"22222222-2222-4222-8222-222222222222"},{...ready,familyRecorded:false},{...ready,visitDate:"2026-02-30"}];
  for (const sample of invalid) { const f=fixture({inspect:async()=>sample}); const response=await run(req(),f.deps); assert.equal(response.status,503); assert.deepEqual(response.body,{ok:false,error:"RECOVERY_INSPECTION_UNAVAILABLE"}); }
  const f=fixture({inspect:async()=>{throw new Error("synthetic sensitive failure");}}); assert.deepEqual((await run(req(),f.deps)).body,{ok:false,error:"RECOVERY_INSPECTION_UNAVAILABLE"});
});
