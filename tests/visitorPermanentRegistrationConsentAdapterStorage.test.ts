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
  const v = createIsolatedVisitorTestTable("HopeConsent148V"+randomUUID().replace(/-/g,""));
  const c = createIsolatedVisitorTestTable("HopeConsent148C"+randomUUID().replace(/-/g,""));
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

test("exact post-cutover creator establishes initial declared grant",()=>fixture(async(v,c)=>{const e=await visit(v,true,true); assert.deepEqual(await bind(v,c)(e),yes); assert.equal(permitsContactWork(await state(c)),true);}));
test("exact creator decline records no eligibility",()=>fixture(async(v,c)=>{const e=await visit(v,false,true); assert.deepEqual(await bind(v,c)(e),yes); assert.equal((await state(c)).effective,"declined");}));
test("existing profile Yes creates pending grant only",()=>fixture(async(v,c)=>{await legacy(v);const e=await visit(v,true,false);assert.deepEqual(await bind(v,c)(e),yes);const s=await state(c);assert.equal(s.effective,"unknown");assert.equal(s.pending?.kind,"grant");assert.equal(permitsContactWork(s),false);}));
test("pre-cutover creation never establishes public grant",()=>fixture(async(v,c)=>{const e=await visit(v,true,true,old);assert.deepEqual(await bind(v,c)(e),yes);assert.equal(permitsContactWork(await state(c)),false);}));
test("missing creation marker fails closed",()=>fixture(async(v,c)=>{const e=await visit(v,true,true);await v.updateEntity({partitionKey:"VISITOR",rowKey:visitorId,name:"Synthetic Visitor",createdAt:time},"Replace");assert.deepEqual(await bind(v,c)(e),no);await absent(c);}));
test("contradictory existing claim cannot grant",()=>fixture(async(v,c)=>{const e=await visit(v,true,true);await v.updateEntity({partitionKey:"VISITOR_CHECK_IN_CLAIM",rowKey:e.submissionId,createProfile:false},"Merge");assert.deepEqual(await bind(v,c)(e),no);await absent(c);}));
test("wrong creation time fails closed",()=>fixture(async(v,c)=>{const e=await visit(v,true,true);await v.updateEntity({partitionKey:"VISITOR",rowKey:visitorId,createdAt:old},"Merge");assert.deepEqual(await bind(v,c)(e),no);await absent(c);}));
test("wrong canonical contact blocks initial grant",()=>fixture(async(v,c)=>{const e=await visit(v,true,true);await v.updateEntity({partitionKey:"VISITOR",rowKey:visitorId,emailLower:"other@example.invalid"},"Merge");assert.deepEqual(await bind(v,c)(e),no);await absent(c);}));
test("missing attendance receipt fails closed",()=>fixture(async(v,c)=>{const e=await visit(v,true,true);await v.deleteEntity("VISITOR_CHECK_IN",e.submissionId);assert.deepEqual(await bind(v,c)(e),no);await absent(c);}));
test("wrong service cannot use receipt",()=>fixture(async(v,c)=>{const e=await visit(v,true,true);assert.deepEqual(await bind(v,c)({...e,serviceId:"other-service"}),no);await absent(c);}));
test("tampered consent receipt conflicts with claim fingerprint",()=>fixture(async(v,c)=>{const e=await visit(v,true,true);const r=await v.getEntity<{registrationDetailsJson:string}>("VISITOR_CHECK_IN",e.submissionId);const d=JSON.parse(r.registrationDetailsJson);d.contactConsent=false;await v.updateEntity({partitionKey:"VISITOR_CHECK_IN",rowKey:e.submissionId,registrationDetailsJson:JSON.stringify(d)},"Merge");assert.deepEqual(await bind(v,c)(e),no);await absent(c);}));
test("exact initial retry after withdrawal cannot restore permission",()=>fixture(async(v,c)=>{const first=await visit(v,true,true);assert.deepEqual(await bind(v,c)(first),yes);const withdrawal=await visit(v,false,false);assert.deepEqual(await bind(v,c)(withdrawal),yes);const before=await state(c);assert.deepEqual(await bind(v,c)(first),yes);assert.deepEqual(await state(c),before);assert.equal(permitsContactWork(before),false);}));
test("old withdrawal retry after verified resolution does not reapply",()=>fixture(async(v,c)=>{const first=await visit(v,true,true);assert.deepEqual(await bind(v,c)(first),yes);const w=await visit(v,false,false);assert.deepEqual(await bind(v,c)(w),yes);const s=await state(c);assert.equal((await repository(c).apply(visitorId,{kind:"verified_staff_decision",expectedRevision:s.revision,decisionId:"synthetic-decision",pendingRequestId:w.submissionId,actorId:"synthetic-staff",decision:"granted"})).status,"committed");const after=await state(c);assert.deepEqual(await bind(v,c)(w),yes);assert.deepEqual(await state(c),after);}));
test("new withdrawal after earlier withdrawal replaces pending reference",()=>fixture(async(v,c)=>{const first=await visit(v,true,true);assert.deepEqual(await bind(v,c)(first),yes);const w1=await visit(v,false,false);assert.deepEqual(await bind(v,c)(w1),yes);const s=await state(c);const w2=await visit(v,false,false);assert.deepEqual(await bind(v,c)(w2),yes);const next=await state(c);assert.equal(next.pending?.requestId,w2.submissionId);assert.equal(next.revision,s.revision+1);}));
test("invalid cutoff denies even exact creator",()=>fixture(async(v,c)=>{const e=await visit(v,true,true);assert.deepEqual(await bind(v,c,"invalid")(e),no);await absent(c);}));
test("bootstrap interrupted before request resumes safely",()=>fixture(async(v,c)=>{await legacy(v);const e=await visit(v,true,false);assert.equal((await repository(c).apply(visitorId,{kind:"existing_profile",evidenceId:`bootstrap:${e.submissionId}`})).status,"committed");assert.deepEqual(await bind(v,c)(e),yes);assert.equal((await state(c)).pending?.kind,"grant");}));
test("operation ID collision with Staff decision cannot count as public replay",()=>fixture(async(v,c)=>{await legacy(v);const e=await visit(v,true,false);const r=repository(c);await r.apply(visitorId,{kind:"existing_profile",evidenceId:"synthetic-bootstrap"});await r.apply(visitorId,{kind:"public_request",requestId:"synthetic-request",expectedRevision:1,requestedConsent:true});await r.apply(visitorId,{kind:"verified_staff_decision",decisionId:e.submissionId,pendingRequestId:"synthetic-request",expectedRevision:2,actorId:"synthetic-staff",decision:"declined"});assert.deepEqual(await bind(v,c)(e),no);}));
