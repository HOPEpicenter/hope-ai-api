import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID, createHash } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";
import { createPermanentVisitorConsentRepository as repository } from "../src/repositories/permanentVisitorConsentRepository";
import { createPermanentVisitorRegistrationConsentAdapter as adapter } from "../src/services/followups/permanentVisitorRegistrationConsentAdapter";
import { permitsContactWork } from "../src/domain/followups/permanentVisitorConsentAuthority";
const visitorId = "synthetic-visitor";
const serviceId = "visit-2026-11-24";
const cutover = "2026-11-24T00:00:00.000Z";
const time = "2026-11-24T12:00:00.000Z";
const old = "2026-11-23T12:00:00.000Z";
const yes = { status: "recorded" };
const no = { status: "unavailable" };
async function fixture(run: (v: TableClient,c: TableClient) => Promise<void>) {
  const v = createIsolatedVisitorTestTable("HopeConsent148BV"+randomUUID().replace(/-/g,""));
  const c = createIsolatedVisitorTestTable("HopeConsent148BC"+randomUUID().replace(/-/g,""));
  await v.createTable(); try { await c.createTable(); try { await run(v,c); } finally { await c.deleteTable(); } } finally { await v.deleteTable(); }
}
function bind(v: TableClient,c: TableClient, initialGrantNotBefore = cutover) { return adapter({visitors:v,repository:repository(c),initialGrantNotBefore}); }
async function visit(v: TableClient, consent: boolean, createProfile: boolean, stamp = time) {
  const submissionId = randomUUID();
  const d = {version:1,name:"Synthetic Visitor",email:"synthetic@example.invalid",phone:null,visitType:"first",churchHome:null,interests:[],invitedBy:null,contactConsent:consent};
  const raw = JSON.stringify(d);
  const fingerprint = createHash("sha256").update(JSON.stringify(["complete-public-visitor-arrival-v1",serviceId,d.name.toLowerCase(),d.email,"",raw])).digest("hex");
  if (createProfile) await v.createEntity({partitionKey:"VISITOR",rowKey:visitorId,name:d.name,email:d.email,emailLower:d.email,checkInCreationId:submissionId,createdAt:stamp});
  await v.createEntity({partitionKey:"VISITOR_CHECK_IN_CLAIM",rowKey:submissionId,visitorId,createProfile,claimedAt:stamp,fingerprint});
  await v.createEntity({partitionKey:"VISITOR_CHECK_IN",rowKey:submissionId,visitorId,serviceId,recordedAt:stamp,registrationDetailsJson:raw});
  return {visitorId,submissionId,serviceId};
}
async function legacy(v: TableClient) { await v.createEntity({partitionKey:"VISITOR",rowKey:visitorId,name:"Synthetic Visitor",email:"synthetic@example.invalid",emailLower:"synthetic@example.invalid",createdAt:old}); }
async function state(c: TableClient) { const r=await repository(c).read(visitorId); assert.equal(r.status,"ready"); if(r.status!=="ready") throw Error("Missing authority"); return r.state; }
async function absent(c: TableClient) { assert.deepEqual(await repository(c).read(visitorId),{status:"not_initialized"}); }

import { createPermanentVisitorConsentRuntime as runtime } from "../src/services/followups/permanentVisitorConsentRuntime";
import { recordVisitorArrival } from "../src/services/visitors/recordVisitorArrival";
import { recordVisitorFamilyCheckIn } from "../src/services/visitors/recordVisitorFamilyCheckIn";
import { enrollRecordedPublicVisitor } from "../src/services/followups/enrollRecordedPublicVisitor";
import { reconcilePermanentVisitCompletion } from "../src/services/visitors/reconcilePermanentVisitCompletion";
import { createPermanentVisitRecoveryJournal } from "../src/services/visitors/permanentVisitRecoveryJournal";
import type { SixWeekFollowupEvent } from "../src/domain/followups/projectSixWeekVisitorFollowup";
import { postPermanentPublicVisitRegistration } from "../src/functions/postPermanentPublicVisitRegistration";
import { postPermanentVisitReconciliation } from "../src/functions/postPermanentVisitReconciliation";
const visitDate = "2026-11-24";
const arrivalInput = (submissionId: string, consent: boolean) => ({submissionId,serviceId,name:"Synthetic Visitor",email:"synthetic@example.invalid",profile:{visitType:"first" as const,churchHome:null,interests:[],invitedBy:null,contactConsent:consent}});
const family = {guardianName:"Synthetic Visitor",guardianDeclaration:true,children:[{firstName:"Child",ageGroup:"6-11"}]};
function plans() {
  const events: SixWeekFollowupEvent[] = [];
  return { events, repository: { append:async (event:SixWeekFollowupEvent)=>{events.push(event);return true;},listByVisitor:async(id:string)=>events.filter(e=>e.visitorId===id) } };
}
async function begin(v:TableClient,e:{submissionId:string;serviceId:string},familyExpected=false){
  const journal=createPermanentVisitRecoveryJournal(v);
  assert.equal(await journal.begin({...e,visitDate,familyExpected,followupExpected:true}),true);
  return journal;
}
test("disabled arrival does not initialize authority",()=>fixture(async(v,c)=>{
  await legacy(v); const input=arrivalInput(randomUUID(),true);
  assert.equal((await recordVisitorArrival(input,{table:v,resolveIdentity:async()=>({status:"matched",visitorId})})).status,"recorded"); await absent(c);
}));
test("adult receipt precedes trusted consent and new profile grant",()=>fixture(async(v,c)=>{
  const r=runtime(v,c,"2020-01-01T00:00:00.000Z"); const input=arrivalInput(randomUUID(),true);
  const result=await recordVisitorArrival(input,{table:v,resolveIdentity:async()=>({status:"unmatched"}),recordConsent:async e=>{
    assert.equal((await v.getEntity("VISITOR_CHECK_IN",e.submissionId)).visitorId,e.visitorId); return r.recordConsent(e);
  }}); assert.equal(result.status,"recorded"); if(result.status!=="recorded") throw Error("adult receipt required");
  const s=await repository(c).read(result.receipt.visitorId); assert.equal(s.status,"ready"); if(s.status!=="ready") throw Error("authority required"); assert.equal(permitsContactWork(s.state),true);
}));
test("unconfirmed consent cannot return successful adult arrival",()=>fixture(async(v,c)=>{
  await legacy(v); const input=arrivalInput(randomUUID(),false);
  await assert.rejects(recordVisitorArrival(input,{table:v,resolveIdentity:async()=>({status:"matched",visitorId}),recordConsent:async()=>({status:"unavailable"})}));
  assert.equal((await v.getEntity("VISITOR_CHECK_IN",input.submissionId)).visitorId,visitorId); await absent(c);
}));
test("family failure preserves withdrawal before family write and retry is idempotent",()=>fixture(async(v,c)=>{
  const first=await visit(v,true,true); const r=runtime(v,c,cutover); assert.deepEqual(await r.recordConsent(first),yes);
  const input={...arrivalInput(randomUUID(),false),family};
  const deps={arrival:(command:Parameters<typeof recordVisitorArrival>[0])=>recordVisitorArrival(command,{table:v,resolveIdentity:async()=>({status:"matched",visitorId}),recordConsent:r.recordConsent}),saveFamily:async()=>{assert.equal(permitsContactWork(await state(c)),false);throw Error("synthetic family outage");}};
  assert.equal((await recordVisitorFamilyCheckIn(input,deps)).status,"family_incomplete"); const s=await state(c); assert.equal(s.pending?.kind,"withdrawal");
  assert.equal((await recordVisitorFamilyCheckIn(input,deps)).status,"family_incomplete"); assert.deepEqual(await state(c),s);
}));
test("failed consent stops family save",()=>fixture(async(v,c)=>{
  await legacy(v); const input={...arrivalInput(randomUUID(),false),family}; let writes=0;
  await assert.rejects(recordVisitorFamilyCheckIn(input,{arrival:command=>recordVisitorArrival(command,{table:v,resolveIdentity:async()=>({status:"matched",visitorId}),recordConsent:async()=>({status:"unavailable"})}),saveFamily:async()=>{writes++;throw Error("unexpected");}})); assert.equal(writes,0); await absent(c);
}));
test("exact initial grant starts plan; public withdrawal never cancels it",()=>fixture(async(v,c)=>{
  const e=await visit(v,true,true); const r=runtime(v,c,cutover); const p=plans(); assert.deepEqual(await r.recordConsent(e),yes);
  const deps={enabled:true,visitors:v,repository:p.repository,readEnrollmentPermission:r.readEnrollmentPermission};
  assert.equal(await enrollRecordedPublicVisitor({...e,visitDate},deps),"enrolled"); assert.equal(p.events.length,1);
  const w=await visit(v,false,false); assert.deepEqual(await r.recordConsent(w),yes);
  assert.equal(await enrollRecordedPublicVisitor({...w,visitDate},deps),"not_eligible"); assert.equal(await enrollRecordedPublicVisitor({...e,visitDate},deps),"not_eligible"); assert.equal(p.events.length,1);
}));
test("existing profile public Yes cannot create plan",()=>fixture(async(v,c)=>{
  await legacy(v);const e=await visit(v,true,false);const r=runtime(v,c,cutover);const p=plans();assert.deepEqual(await r.recordConsent(e),yes);
  assert.equal(await enrollRecordedPublicVisitor({...e,visitDate},{enabled:true,visitors:v,repository:p.repository,readEnrollmentPermission:r.readEnrollmentPermission}),"not_eligible");assert.equal(p.events.length,0);
}));
test("missing operation cannot authorize enrollment",()=>fixture(async(v,c)=>{
  const e=await visit(v,true,true);const r=runtime(v,c,cutover);const p=plans();
  assert.equal(await enrollRecordedPublicVisitor({...e,visitDate},{enabled:true,visitors:v,repository:p.repository,readEnrollmentPermission:r.readEnrollmentPermission}),"unavailable");assert.equal(p.events.length,0);
}));
test("reconciliation persists consent before enrollment and completion",()=>fixture(async(v,c)=>{
  const e=await visit(v,true,true);const j=await begin(v,{submissionId:e.submissionId,serviceId:e.serviceId});const r=runtime(v,c,cutover);const p=plans();const deps={enabled:true,visitors:v,repository:p.repository,...r};
  assert.equal(await reconcilePermanentVisitCompletion(e.submissionId,deps),"completed");assert.equal(p.events.length,1);assert.equal((await j.inspect(e.submissionId)).status,"completed");assert.equal(await reconcilePermanentVisitCompletion(e.submissionId,deps),"already_completed");assert.equal(p.events.length,1);
}));
test("incomplete family recovery suppresses contact without completing family or plan",()=>fixture(async(v,c)=>{
  const first=await visit(v,true,true);const r=runtime(v,c,cutover);assert.deepEqual(await r.recordConsent(first),yes);const w=await visit(v,false,false);const j=await begin(v,{submissionId:w.submissionId,serviceId:w.serviceId},true);const p=plans();
  assert.equal(await reconcilePermanentVisitCompletion(w.submissionId,{enabled:true,visitors:v,repository:p.repository,...r}),"requires_review");assert.equal(permitsContactWork(await state(c)),false);assert.equal((await j.inspect(w.submissionId)).status,"pending");assert.equal(p.events.length,0);
}));
test("reconciliation refuses mismatched authority dependencies",()=>fixture(async(v,c)=>{
  const e=await visit(v,true,true);const j=await begin(v,{submissionId:e.submissionId,serviceId:e.serviceId});const r=runtime(v,c,cutover);const p=plans();
  assert.equal(await reconcilePermanentVisitCompletion(e.submissionId,{enabled:true,visitors:v,repository:p.repository,recordConsent:r.recordConsent}),"unavailable");assert.equal((await j.inspect(e.submissionId)).status,"pending");await absent(c);
}));
test("failed recovery consent cannot complete journal or start plan",()=>fixture(async(v,c)=>{
  const e=await visit(v,true,true);const j=await begin(v,{submissionId:e.submissionId,serviceId:e.serviceId});const r=runtime(v,c,cutover);const p=plans();
  assert.equal(await reconcilePermanentVisitCompletion(e.submissionId,{enabled:true,visitors:v,repository:p.repository,...r,recordConsent:async()=>({status:"unavailable"})}),"unavailable");assert.equal((await j.inspect(e.submissionId)).status,"pending");assert.equal(p.events.length,0);
}));
test("accidental flag activation is fenced before either HTTP runtime",async()=>{
  const flags=["FEATURE_PERMANENT_PUBLIC_VISIT","FEATURE_PERMANENT_VISITOR_CONSENT_GUARD","FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP","FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY","FEATURE_PERMANENT_VISIT_RECOVERY_RECONCILIATION","FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION"];
  const saved=flags.map(k=>process.env[k]);try{for(const k of flags)process.env[k]="true";const pub:Parameters<typeof postPermanentPublicVisitRegistration>[0]={};const admin:{res?:{status:number}}={};await postPermanentPublicVisitRegistration(pub,{method:"POST"},{runtime:async()=>{throw Error("unexpected runtime");}});await postPermanentVisitReconciliation(admin,{method:"POST"},{readStaff:async()=>{throw Error("unexpected staff lookup");}});assert.equal(pub.res?.status,503);assert.equal(admin.res?.status,503);}finally{flags.forEach((k,i)=>{const x=saved[i];if(x===undefined)delete process.env[k];else process.env[k]=x;});}
});
