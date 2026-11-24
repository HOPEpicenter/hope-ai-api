import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import { getPermanentVisitReconciliationAudit as handle } from "../../src/functions/getPermanentVisitReconciliationAudit";
import type { ReconciliationAuditReview } from "../../src/services/visitors/discoverReconciliationAudit";

type Deps = NonNullable<Parameters<typeof handle>[2]>;
const id = "11111111-1111-4111-8111-111111111111";
const actor = "synthetic-admin-122";
const key = "synthetic-admin-key-122";
const staffKey = "synthetic-staff-key-122";
const bridge = "synthetic-bridge-key-122";
const flag = "FEATURE_PERMANENT_VISIT_RECOVERY_AUDIT_REVIEW";
const stamp = "2026-11-24T19:00:00.000Z";
const staff: CanonicalStaffIdentity = { staffId: actor, displayName: "Synthetic Admin", roleLabel: "Pastor", status: "active", createdAt: stamp, updatedAt: stamp, lastEventId: "synthetic-event", entraTenantId: null, entraObjectId: null, email: null, phone: null, ministryAreaId: null };
const date = "2026-11-24";
const later = "22222222-2222-4222-8222-222222222222";
const entry = {operationId:id, actorId:actor, submissionId:later, recordedAt:stamp, status:"outcome_unconfirmed"} as const;
const recorded = {...entry, operationId:later, status:"outcome_recorded", outcome:"completed", outcomeRecordedAt:"2026-11-25T00:00:00.000Z"} as const;
const ready = {status:"ready", utcDate:date, scanned:2, items:[entry,recorded], nextCursor:null} as const;
function page(): ReconciliationAuditReview { return {...ready,items:[...ready.items]}; }
function req(headers: Record<string,string> = { "x-admin-api-key": key, "x-hope-admin-actor-id": actor }, query: Record<string,unknown> = { utcDate: date }, method = "GET") { return {headers,query,method}; }
function fixture(overrides: Deps = {}) {
  const calls = {staff:0,discover:0};
  const deps: Deps = { readStaff:async value=>{ calls.staff++; assert.equal(value,actor); return staff; }, discover:async value=>{calls.discover++; assert.deepEqual(value,{utcDate:date,limit:20}); return page();}, ...overrides };
  return {calls,deps};
}
async function run(request: ReturnType<typeof req>, deps: Deps, changes: Record<string,string|undefined> = {}) {
  const values = { [flag]: "true", HOPE_ADMIN_API_KEY: key, HOPE_ADMIN_STAFF_IDS: actor, HOPE_API_KEY: staffKey, HOPE_PERMANENT_VISIT_BRIDGE_KEY: bridge, HOPE_PERMANENT_VISIT_SESSION_SECRET: "synthetic-session-122", HOPE_PERMANENT_VISIT_CLAIM_SECRET: "synthetic-claim-122", ...changes };
  const old = new Map<string,string|undefined>();
  for (const [name,value] of Object.entries(values)) { old.set(name,process.env[name]); if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  try {
    const context: any = {};
    await handle(context, request, deps);
    assert.equal(context.res.headers["cache-control"], "no-store");
    return context.res;
  } finally { for (const [name,value] of old) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
}
test("disabled feature prevents authorization and discovery", async()=>{ for(const value of [undefined,"false","TRUE",""]){const f=fixture();assert.equal((await run(req(),f.deps,{[flag]:value})).status,404);assert.deepEqual(f.calls,{staff:0,discover:0});}});
test("public and ordinary staff keys are rejected",async()=>{for(const value of [{},{"x-api-key":staffKey},{"x-hope-public-visit-key":bridge},{"x-admin-api-key":staffKey,"x-hope-admin-actor-id":actor},{"x-admin-api-key":bridge,"x-hope-admin-actor-id":actor}]){const f=fixture();assert.equal((await run(req(value as Record<string,string>),f.deps)).status,401);assert.equal(f.calls.discover,0);}});
test("unknown inactive and unconfigured administrators denied",async()=>{const f=fixture();assert.equal((await run(req({"x-admin-api-key":key}),f.deps)).status,401);assert.equal((await run(req(),f.deps,{HOPE_ADMIN_STAFF_IDS:""})).status,500);assert.equal((await run(req({"x-admin-api-key":key,"x-hope-admin-actor-id":"other"}),f.deps)).status,403);for(const identity of [null,{...staff,status:"inactive" as const}]){const x=fixture({readStaff:async()=>identity});assert.equal((await run(req(),x.deps)).status,403);assert.equal(x.calls.discover,0);}});
test("shared keys fail closed",async()=>{for(const name of ["HOPE_API_KEY","HOPE_PERMANENT_VISIT_BRIDGE_KEY","HOPE_PERMANENT_VISIT_SESSION_SECRET","HOPE_PERMANENT_VISIT_CLAIM_SECRET"]){const f=fixture();assert.equal((await run(req(),f.deps,{[name]:key})).status,503);assert.deepEqual(f.calls,{staff:0,discover:0});}});
test("invalid query and method cannot reach discovery",async()=>{const f=fixture();assert.equal((await run(req(undefined,undefined,"POST"),f.deps)).status,405);for(const q of [{},{utcDate:"2026-02-30"},{utcDate:[date]},{utcDate:date,cursor:"'"},{utcDate:date,cursor:""}])assert.equal((await run(req(undefined,q),f.deps)).status,400);assert.equal(f.calls.discover,0);});
test("exact minimal audit projection distinguishes unconfirmed and recorded outcomes",async()=>{
  const f=fixture({discover:async()=>({...ready,items:[{...entry,...{privateField:"synthetic private"}},{...recorded,...{privateField:"synthetic private"}}]})});
  const r=await run(req(),f.deps);assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,audit:ready});
});
test("bounded ordered audit pages require exact last operation cursor",async()=>{
  const cursor="00000000-0000-4000-8000-000000000000";
  const items=Array.from({length:20},(_,i)=>({...entry,operationId:`11111111-1111-4111-8111-${String(i).padStart(12,"0")}`}));
  const nextCursor=items[19].operationId;
  const f=fixture({discover:async input=>{assert.deepEqual(input,{utcDate:date,cursor,limit:20});return {status:"ready",utcDate:date,scanned:20,items,nextCursor};}});
  const r=await run(req(undefined,{utcDate:date,cursor}),f.deps);assert.equal(r.status,200);assert.equal(r.body.audit.nextCursor,nextCursor);
  const invalid=await run(req(),fixture({discover:async()=>({status:"ready",utcDate:date,scanned:20,items,nextCursor:later})}).deps);assert.equal(invalid.status,503);
});
test("inconsistent audit evidence and storage failure fail closed without partial page",async()=>{
  const samples:ReconciliationAuditReview[]=[{status:"unavailable"},{...ready,utcDate:"2026-11-23",items:[entry,recorded]},{...ready,items:[entry,entry]},{...ready,items:[entry]},{...ready,items:[{...entry,actorId:"invalid actor"},recorded]},{...ready,items:[{...entry,recordedAt:"2026-11-23T19:00:00.000Z"},recorded]},{...ready,items:[entry,{...recorded,outcomeRecordedAt:"2026-11-24T18:00:00.000Z"}]},{...ready,items:[{...entry,...{outcome:"completed"}},recorded]},{...ready,items:[entry,recorded],nextCursor:later}];
  for(const sample of samples){const r=await run(req(),fixture({discover:async()=>sample}).deps);assert.equal(r.status,503);assert.deepEqual(r.body,{ok:false,error:"RECONCILIATION_AUDIT_UNAVAILABLE"});}
  assert.equal((await run(req(),fixture({discover:async()=>{throw new Error("private");}}).deps)).status,503);
});
