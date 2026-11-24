import { strict as assert } from "node:assert";
import { before, test } from "node:test";
import { TableClient } from "@azure/data-tables";
const intentPartition = "PUBLIC_VISIT_ADMIN_RECONCILIATION_INTENT";
const outcomePartition = "PUBLIC_VISIT_ADMIN_RECONCILIATION_OUTCOME";
let auditTable: TableClient;
function isolatedAuditClient(): TableClient {
  const connection = process.env.STORAGE_CONNECTION_STRING ?? "";
  const port = process.env.HOPE_VISITOR_72_ISOLATED_PORT ?? "";
  if (process.env.HOPE_VISITOR_72_LOCAL_RUNTIME !== "true" || !/^\d{1,5}$/.test(port) ||
      Number(port) < 1 || Number(port) > 65535 || Number(port) === 10002 ||
      process.env.HOPE_TABLE_AUTH_MODE !== "connection-string" || process.env.AzureWebJobsStorage !== connection) {
    throw new Error("isolated storage required");
  }
  const endpoint = `http://127.0.0.1:${port}/hopevisitor72`;
  const parts = connection.split(";");
  if (parts.length !== 6 || parts[0] !== "DefaultEndpointsProtocol=http" ||
      parts[1] !== "AccountName=hopevisitor72" || !/^AccountKey=[A-Za-z0-9+/]+={0,2}$/.test(parts[2]) ||
      parts[3] !== `TableEndpoint=${endpoint}` || parts[4] !== `BlobEndpoint=${endpoint}` ||
      parts[5] !== `QueueEndpoint=${endpoint}`) throw new Error("exact isolated connection required");
  // Only this guarded test client may use the owned HTTP emulator.
  const table = TableClient.fromConnectionString(connection, "Visitors", { allowInsecureConnection: true });
  const actual = new URL(table.url);
  if (actual.protocol !== "http:" || actual.hostname !== "127.0.0.1" || actual.port !== port ||
      actual.pathname.replace(/\/$/, "") !== "/hopevisitor72" || actual.username || actual.password ||
      actual.search || actual.hash) throw new Error("isolated table endpoint required");
  return table;
}
before(async () => {
  auditTable = isolatedAuditClient();
  await auditTable.createTable();
});
async function rows(partition: string) {
  const result = [];
  for await (const row of auditTable.listEntities({queryOptions:{filter:`PartitionKey eq '${partition}'`}})) result.push(row);
  return result;
}
import type { CanonicalStaffIdentity } from "../../src/domain/staff/projectStaffDirectory";
import { postPermanentVisitReconciliation as handle } from "../../src/functions/postPermanentVisitReconciliation";
type Deps = NonNullable<Parameters<typeof handle>[2]>;
const id = "11111111-1111-4111-8111-111111111111";
const actor = "synthetic-admin-118";
const key = "synthetic-admin-key-118";
const staffKey = "synthetic-staff-key-118";
const bridge = "synthetic-bridge-key-118";
const flag = "FEATURE_PERMANENT_VISIT_RECOVERY_RECONCILIATION";
const inspection = "FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION";
const consent = "FEATURE_PERMANENT_VISITOR_CONSENT_GUARD";
const followup = "FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP";
const stamp = "2026-11-24T19:00:00.000Z";
const staff: CanonicalStaffIdentity = { staffId: actor, displayName: "Synthetic Admin", roleLabel: "Pastor", status: "active", createdAt: stamp, updatedAt: stamp, lastEventId: "synthetic-event", entraTenantId: null, entraObjectId: null, email: null, phone: null, ministryAreaId: null };
const confirmation = { submissionId:id, confirmation:"reconcile_saved_attendance" };
function req(headers: Record<string,string> = { "x-admin-api-key":key,"x-hope-admin-actor-id":actor }, body: unknown = confirmation, method = "POST", submissionId = id) {
  return { headers, body, method, params:{submissionId} };
}
function fixture(overrides: Deps = {}) {
  const calls = { staff:0, reconcile:0 };
  const deps: Deps = { auditTable, readStaff: async value => { calls.staff++; assert.equal(value,actor); return staff; }, reconcile:async value=>{calls.reconcile++;assert.equal(value,id);return "completed";}, ...overrides };
  return {calls,deps};
}
async function run(request: ReturnType<typeof req>, deps: Deps, changes: Record<string,string|undefined> = {}) {
  const values = { [flag]:"true", [inspection]:"true", [consent]:"true", [followup]:"true", HOPE_ADMIN_API_KEY:key, HOPE_ADMIN_STAFF_IDS:actor, HOPE_API_KEY:staffKey, HOPE_PERMANENT_VISIT_BRIDGE_KEY:bridge, HOPE_PERMANENT_VISIT_SESSION_SECRET:"synthetic-session-118", HOPE_PERMANENT_VISIT_CLAIM_SECRET:"synthetic-claim-118", ...changes };
  const old = new Map<string,string|undefined>();
  for (const [name,value] of Object.entries(values)) { old.set(name,process.env[name]); if(value===undefined) delete process.env[name]; else process.env[name]=value; }
  try { const context:any={}; await handle(context,request,deps); assert.equal(context.res.headers["cache-control"],"no-store"); return context.res; }
  finally { for(const [name,value] of old) {if(value===undefined) delete process.env[name]; else process.env[name]=value;} }
}
test("execution and inspection flags are independently default off",async()=>{for(const name of [flag,inspection])for(const value of [undefined,"false","TRUE",""]){const f=fixture();assert.equal((await run(req(),f.deps,{[name]:value})).status,404);assert.deepEqual(f.calls,{staff:0,reconcile:0});}});
test("consent and automatic followup guards are mandatory",async()=>{for(const name of [consent,followup]){const f=fixture();assert.equal((await run(req(),f.deps,{[name]:undefined})).status,503);assert.deepEqual(f.calls,{staff:0,reconcile:0});}});
test("ordinary and public credentials cannot execute reconciliation",async()=>{const headers:Record<string,string>[]=[{}, {"x-api-key":staffKey},{"x-hope-public-visit-key":bridge},{"x-admin-api-key":staffKey,"x-hope-admin-actor-id":actor},{"x-admin-api-key":bridge,"x-hope-admin-actor-id":actor}];for(const h of headers){const f=fixture();assert.equal((await run(req(h),f.deps)).status,401);assert.deepEqual(f.calls,{staff:0,reconcile:0});}});
test("missing unconfigured unknown and inactive administrator denied",async()=>{const f=fixture();assert.equal((await run(req({"x-admin-api-key":key}),f.deps)).status,401);assert.equal((await run(req({"x-admin-api-key":key,"x-hope-admin-actor-id":"other"}),f.deps)).status,403);for(const identity of [null,{...staff,status:"inactive" as const}]){const x=fixture({readStaff:async()=>identity});assert.equal((await run(req(),x.deps)).status,403);assert.equal(x.calls.reconcile,0);}assert.equal(f.calls.reconcile,0);});
test("shared credential configuration denies execution before staff lookup",async()=>{for(const name of ["HOPE_API_KEY","HOPE_PERMANENT_VISIT_BRIDGE_KEY","HOPE_PERMANENT_VISIT_SESSION_SECRET","HOPE_PERMANENT_VISIT_CLAIM_SECRET"]){const f=fixture();assert.equal((await run(req(),f.deps,{[name]:key})).status,503);assert.deepEqual(f.calls,{staff:0,reconcile:0});}});
test("only explicit POST confirmation bound to exact submission can execute",async()=>{const f=fixture();assert.equal((await run(req(undefined,confirmation,"GET"),f.deps)).status,405);assert.equal((await run(req(undefined,confirmation,"POST","invalid"),f.deps)).status,400);for(const body of [null,{},[],{...confirmation,actorId:actor},{...confirmation,submissionId:"22222222-2222-4222-8222-222222222222"},{...confirmation,confirmation:true}])assert.equal((await run(req(undefined,body),f.deps)).status,400);assert.equal(f.calls.reconcile,0);});
test("authorized command returns only exact submission and known success status",async()=>{const f=fixture();const r=await run(req(),f.deps);assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true,submissionId:id,status:"completed"});assert.equal(f.calls.reconcile,1);const replay=await run(req(),fixture({reconcile:async()=>"already_completed"}).deps);assert.equal(replay.status,200);assert.deepEqual(replay.body,{ok:true,submissionId:id,status:"already_completed"});});
test("incomplete evidence and unavailable execution never become success",async()=>{const review=await run(req(),fixture({reconcile:async()=>"requires_review"}).deps);assert.equal(review.status,409);assert.deepEqual(review.body,{ok:false,error:"RECOVERY_REQUIRES_REVIEW"});for(const result of ["disabled","unavailable"] as const){const r=await run(req(),fixture({reconcile:async()=>result}).deps);assert.equal(r.status,503);assert.deepEqual(r.body,{ok:false,error:"RECOVERY_RECONCILIATION_UNAVAILABLE"});}const failure=await run(req(),fixture({reconcile:async()=>{throw new Error("synthetic private details");}}).deps);assert.equal(failure.status,503);assert.deepEqual(failure.body,{ok:false,error:"RECOVERY_RECONCILIATION_UNAVAILABLE"});});

test("durable exact administrator intent precedes execution and outcome survives a fresh reader", async()=>{
  const beforeIntents = await rows(intentPartition);
  const beforeOutcomes = await rows(outcomePartition);
  let op = "";
  const f = fixture({reconcile:async()=>{
    const current = (await rows(intentPartition)).filter(r=>!beforeIntents.some(x=>x.rowKey===r.rowKey));
    assert.equal(current.length,1); const row=current[0]; op=row.rowKey!;
    assert.equal(row.actorId,actor); assert.equal(row.submissionId,id); assert.equal(row.operation,"reconcile_saved_attendance");
    assert.equal(row.version,1); assert.equal(typeof row.recordedAt,"string");
    assert.equal((await rows(outcomePartition)).length,beforeOutcomes.length);
    return "completed";
  }});
  assert.equal((await run(req(),f.deps)).status,200);
  const fresh = isolatedAuditClient();
  const outcome = await fresh.getEntity(outcomePartition,op);
  assert.equal(outcome.actorId,actor); assert.equal(outcome.submissionId,id); assert.equal(outcome.outcome,"completed");
  // The exact entity response can include Azure Tables OData service metadata.
  // Do not use wildcard exclusions: every other unexpected field remains a failure.
  const allowed=new Set(["partitionKey","rowKey","timestamp","etag","odata.metadata","version","actorId","submissionId","operation","recordedAt","outcome"]);
  const unexpected=Object.keys(outcome).filter(k=>!allowed.has(k)).sort();
  assert.deepEqual(unexpected,[],"unexpected audit response field names (synthetic fixture only)");
  assert.equal(outcome.partitionKey,outcomePartition);
  assert.equal(outcome.rowKey,op);
  assert.equal(outcome.version,1);
  assert.equal(outcome.operation,"reconcile_saved_attendance");
  assert.equal(typeof outcome.recordedAt,"string");
  const persisted=(await rows(outcomePartition)).filter(r=>r.rowKey===op);
  assert.equal(persisted.length,1);
  assert.deepEqual(Object.keys(persisted[0]).filter(k=>!allowed.has(k)).sort(),[],"unexpected persisted audit field names (synthetic fixture only)");
  for(const field of ["partitionKey","rowKey","version","actorId","submissionId","operation","recordedAt","outcome"] as const) {
    assert.equal(persisted[0][field],outcome[field]);
  }
  const retry=await run(req(),fixture({reconcile:async()=>"already_completed"}).deps);
  assert.equal(retry.status,200);
  assert.equal((await rows(intentPartition)).length,beforeIntents.length+2);
  assert.equal((await rows(outcomePartition)).length,beforeOutcomes.length+2);
});

test("failed or unverifiable audit intent blocks execution",async()=>{
  const base = {createEntity:auditTable.createEntity.bind(auditTable),getEntity:auditTable.getEntity.bind(auditTable)};
  const f=fixture({auditTable:{...base,createEntity:async()=>{throw new Error("synthetic write failure");}}});
  assert.equal((await run(req(),f.deps)).status,503); assert.equal(f.calls.reconcile,0);
  const g=fixture({auditTable:{...base,getEntity:async()=>{throw new Error("synthetic read failure");}}});
  assert.equal((await run(req(),g.deps)).status,503); assert.equal(g.calls.reconcile,0);
});

test("outcome write failure returns unconfirmed while preserving durable intent",async()=>{
  const previous=await rows(intentPartition); const outcomes=await rows(outcomePartition);
  const f=fixture({auditTable:{getEntity:auditTable.getEntity.bind(auditTable),createEntity:async row=>{
    if(row.partitionKey===outcomePartition) throw new Error("synthetic outcome write failure");
    return auditTable.createEntity(row);
  }}});
  assert.equal((await run(req(),f.deps)).status,503); assert.equal(f.calls.reconcile,1);
  assert.equal((await rows(intentPartition)).length,previous.length+1);
  assert.equal((await rows(outcomePartition)).length,outcomes.length);
});

test("denied requests create no audit and execution failure records only minimal unavailable outcome",async()=>{
  const intents=await rows(intentPartition), outcomes=await rows(outcomePartition);
  const f=fixture(); assert.equal((await run(req({}),f.deps)).status,401);
  assert.equal((await run(req(undefined,{}),f.deps)).status,400);
  assert.equal((await rows(intentPartition)).length,intents.length);
  assert.equal((await rows(outcomePartition)).length,outcomes.length);
  const failed=fixture({reconcile:async()=>{throw new Error("synthetic secret error");}});
  assert.equal((await run(req(),failed.deps)).status,503);
  const added=(await rows(outcomePartition)).filter(r=>!outcomes.some(x=>x.rowKey===r.rowKey));
  assert.equal(added.length,1); assert.equal(added[0].outcome,"unavailable");
  assert.equal(added[0].actorId,actor); assert.equal(added[0].submissionId,id);
  assert.ok(!JSON.stringify(added).includes("synthetic secret error"));
});
