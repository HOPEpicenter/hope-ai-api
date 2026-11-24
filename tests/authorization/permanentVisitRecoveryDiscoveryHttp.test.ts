import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import { getPermanentVisitRecoveryDiscovery as handle } from "../../src/functions/getPermanentVisitRecoveryDiscovery";
import type { PermanentVisitRecoveryDiscovery } from "../../src/services/visitors/discoverPermanentVisitRecovery";

type Deps = NonNullable<Parameters<typeof handle>[2]>;
const id = "11111111-1111-4111-8111-111111111111";
const actor = "synthetic-admin-114";
const key = "synthetic-admin-key-114";
const staffKey = "synthetic-staff-key-114";
const bridge = "synthetic-bridge-key-114";
const flag = "FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION";
const stamp = "2026-11-24T19:00:00.000Z";
const staff: CanonicalStaffIdentity = { staffId: actor, displayName: "Synthetic Admin", roleLabel: "Pastor", status: "active", createdAt: stamp, updatedAt: stamp, lastEventId: "synthetic-event", entraTenantId: null, entraObjectId: null, email: null, phone: null, ministryAreaId: null };
const date = "2026-11-24";
const later = "22222222-2222-4222-8222-222222222222";
const entry = { status: "ready", submissionId: id, serviceId: "visit-2026-11-24", visitDate: date, stage: "family_attendance_unconfirmed", familyExpected: true, followupExpected: true, adultRecorded: true, familyRecorded: false } as const;
const ready = { status: "ready", visitDate: date, scanned: 2, items: [entry, {status:"unavailable",submissionId:later} as const], nextCursor: null } as const;
function page(): PermanentVisitRecoveryDiscovery { return { ...ready, items: [...ready.items] }; }
function req(headers: Record<string,string> = { "x-admin-api-key": key, "x-hope-admin-actor-id": actor }, query: Record<string,unknown> = { visitDate: date }, method = "GET") { return {headers,query,method}; }
function fixture(overrides: Deps = {}) {
  const calls = {staff:0,discover:0};
  const deps: Deps = { readStaff:async value=>{ calls.staff++; assert.equal(value,actor); return staff; }, discover:async value=>{calls.discover++; assert.deepEqual(value,{visitDate:date,limit:20}); return page();}, ...overrides };
  return {calls,deps};
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
test("disabled feature prevents authorization and discovery", async()=>{ for(const value of [undefined,"false","TRUE",""]){const f=fixture();assert.equal((await run(req(),f.deps,{[flag]:value})).status,404);assert.deepEqual(f.calls,{staff:0,discover:0});}});
test("public and ordinary staff keys are rejected",async()=>{for(const value of [{},{"x-api-key":staffKey},{"x-hope-public-visit-key":bridge},{"x-admin-api-key":staffKey,"x-hope-admin-actor-id":actor},{"x-admin-api-key":bridge,"x-hope-admin-actor-id":actor}]){const f=fixture();assert.equal((await run(req(value as Record<string,string>),f.deps)).status,401);assert.equal(f.calls.discover,0);}});
test("unknown inactive and unconfigured administrators denied",async()=>{const f=fixture();assert.equal((await run(req({"x-admin-api-key":key}),f.deps)).status,401);assert.equal((await run(req({"x-admin-api-key":key,"x-hope-admin-actor-id":"other"}),f.deps)).status,403);for(const identity of [null,{...staff,status:"inactive" as const}]){const x=fixture({readStaff:async()=>identity});assert.equal((await run(req(),x.deps)).status,403);assert.equal(x.calls.discover,0);}});
test("shared keys fail closed",async()=>{for(const name of ["HOPE_API_KEY","HOPE_PERMANENT_VISIT_BRIDGE_KEY"]){const f=fixture();assert.equal((await run(req(),f.deps,{[name]:key})).status,503);assert.deepEqual(f.calls,{staff:0,discover:0});}});
test("invalid query and method cannot reach discovery",async()=>{const f=fixture();assert.equal((await run(req(undefined,undefined,"POST"),f.deps)).status,405);for(const q of [{},{visitDate:"2026-02-30"},{visitDate:[date]},{visitDate:date,cursor:"'"},{visitDate:date,cursor:""}])assert.equal((await run(req(undefined,q),f.deps)).status,400);assert.equal(f.calls.discover,0);});
test("minimal projection retains unavailable evidence without raw fields",async()=>{const f=fixture({discover:async()=>({...page(),status:"ready",visitDate:date,scanned:2,nextCursor:null,items:[{...entry,...{childName:"private"}},{...{status:"unavailable" as const,submissionId:later},...{secret:"private"}} ]})});const r=await run(req(),f.deps);assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,discovery:ready});});
test("empty page can advance cursor with fixed scan limit",async()=>{const f=fixture({discover:async input=>{assert.deepEqual(input,{visitDate:date,cursor:id,limit:20});return {status:"ready",visitDate:date,scanned:20,items:[],nextCursor:later};}});const r=await run(req(undefined,{visitDate:date,cursor:id}),f.deps);assert.equal(r.status,200);assert.deepEqual(r.body.discovery,{status:"ready",visitDate:date,scanned:20,items:[],nextCursor:later});});
test("invalid page evidence and storage failure fail closed",async()=>{const samples: PermanentVisitRecoveryDiscovery[]=[{status:"unavailable"},{...ready,items:[...ready.items],visitDate:"2026-11-23"},{...ready,items:[entry,entry]},{...ready,items:[{...entry,stage:"completed"}]},{...ready,items:[{...entry,familyRecorded:true}]},{...ready,items:[],scanned:21},{...ready,items:[],nextCursor:id}];for(const sample of samples){const r=await run(req(),fixture({discover:async()=>sample}).deps);assert.equal(r.status,503);assert.deepEqual(r.body,{ok:false,error:"RECOVERY_DISCOVERY_UNAVAILABLE"});}assert.equal((await run(req(),fixture({discover:async()=>{throw new Error("private");}}).deps)).status,503);});
