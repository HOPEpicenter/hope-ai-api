import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";
import { createPermanentVisitorConsentRepository as baseRepo } from "../src/repositories/permanentVisitorConsentRepository";
import { CONTACT_WRITER_HOLD_MESSAGE as message, assessHeldContactIntent as assess, contactMutationHeld as held, contactWriterHoldEnabled as enabled } from "../src/services/followups/permanentVisitorContactWriterHold";
import { requireCurrentRegistrationContactPermission as guard } from "../src/services/followups/requireCurrentRegistrationContactPermission";
import { requireRegistrationEventContactPermission as eventGuard } from "../src/services/followups/requireRegistrationEventContactPermission";
import { mayExposeRegistrationContactWork as expose } from "../src/services/followups/mayExposeRegistrationContactWork";
import { startConsentProtectedSixWeekFollowup as start } from "../src/services/followups/startConsentProtectedSixWeekFollowup";
import { readSixWeekVisitorFollowupQueue as queue } from "../src/services/followups/readSixWeekVisitorFollowups";
import { SixWeekFollowupEventsRepository } from "../src/repositories/sixWeekFollowupEventsRepository";
import { MinistryCommunicationEventsRepository } from "../src/repositories/ministryCommunicationEventsRepository";
import { EngagementEventsRepository } from "../src/repositories/engagementEventsRepository";
import type { SixWeekFollowupEvent } from "../src/domain/followups/projectSixWeekVisitorFollowup";
import type { MinistryCommunicationEvent } from "../src/domain/communications/phase5CommunicationContracts";
import { getVisitorRegistrationHistory as history } from "../src/functions/getVisitorRegistrationHistory";
import type { CanonicalStaffIdentity } from "../src/domain/staff/projectStaffDirectory";
import { postPermanentPublicVisitRegistration as publicEndpoint } from "../src/functions/postPermanentPublicVisitRegistration";
import { postPermanentVisitReconciliation as recoveryEndpoint } from "../src/functions/postPermanentVisitReconciliation";
const flag="FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY", oldGuard="FEATURE_PERMANENT_VISITOR_CONSENT_GUARD", cutoff="HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER";
const stamp="2026-11-24T12:00:00.000Z", id="synthetic-148g-visitor", actor="synthetic-148g-staff";
const intent={operationId:"synthetic-intent",actorId:actor,expectedRevision:1,scope:"six_week",commandDigest:"a".repeat(64)};
const result=(status:string)=>({status,executionPermitted:false});
const init={kind:"new_profile",evidenceId:"initial",initialConsent:true};
const withdrawal={kind:"public_request",expectedRevision:1,requestId:"withdrawal",requestedConsent:false};
const plan:SixWeekFollowupEvent={eventId:"synthetic-plan",visitorId:id,type:"six_week_followup.plan_started",occurredAt:stamp,actorId:actor,data:{firstVisitDate:"2026-11-24",ownerStaffId:null,contactConsent:true,preferredContactMethod:null}};
async function env<T>(values:Record<string,string|undefined>,run:()=>Promise<T>):Promise<T>{const saved=Object.keys(values).map(k=>[k,process.env[k]] as const);try{for(const [k,v] of Object.entries(values)){if(v===undefined)delete process.env[k];else process.env[k]=v;}return await run();}finally{for(const [k,v] of saved){if(v===undefined)delete process.env[k];else process.env[k]=v;}}}
async function fixture(run:(c:TableClient)=>Promise<void>){const c=createIsolatedVisitorTestTable("VisitorFollowupEvents");await c.createTable();try{assert.equal((await repo(c).apply(id,init)).status,"committed");await env({[flag]:"true",[oldGuard]:"false",[cutoff]:stamp},()=>run(c));}finally{await c.deleteTable();}}
async function rows(c:TableClient){const out:unknown[]=[];for await(const row of c.listEntities())out.push(row);return out;}
function denied(e:unknown){return e instanceof Error && e.message===message && (e as Error & {statusCode?:number}).statusCode===503;}
test("authority hold default off preserves legacy guards and does not inspect intent",async()=>{for(const value of [undefined,"false","TRUE",""])await env({[flag]:value,[oldGuard]:undefined},async()=>{assert.equal(enabled(),false);assert.equal(held("six_week",plan.type,plan.data),false);assert.equal(await guard(id,async()=>"declined"),null);assert.deepEqual(await assess({inspectContactIntent:async()=>{throw Error("must not read");}},id,intent),result("disabled"));});});
test("current exact durable intent is held and read-only assessment cannot release it",()=>fixture(async c=>{const r=repo(c);assert.equal((await r.recordContactIntent(id,intent)).status,"recorded");const before=await rows(c);assert.deepEqual(await assess(r,id,intent),result("held"));assert.deepEqual(await assess(r,id,intent),result("held"));assert.deepEqual(await rows(c),before);assert.equal(held("six_week",plan.type,plan.data),true);}));
test("withdrawal and verified later grant never revive old intent",()=>fixture(async c=>{const r=repo(c);await r.recordContactIntent(id,intent);assert.equal((await r.apply(id,withdrawal)).status,"committed");assert.deepEqual(await assess(r,id,intent),result("stale"));assert.equal((await r.apply(id,{kind:"verified_staff_decision",expectedRevision:2,decisionId:"resolution",pendingRequestId:"withdrawal",actorId:actor,decision:"granted"})).status,"committed");assert.deepEqual(await assess(r,id,intent),result("stale"));assert.equal((await guard(id))?.error,message);}));
test("conflicting and missing intent evidence never authorizes cross-store writes",()=>fixture(async c=>{const r=repo(c);await r.recordContactIntent(id,intent);for(const change of [{actorId:"other"},{scope:"care"},{commandDigest:"b".repeat(64)},{expectedRevision:2}])assert.deepEqual(await assess(r,id,{...intent,...change}),result("conflict"));assert.deepEqual(await assess(r,id,{...intent,operationId:"missing"}),result("not_found"));assert.deepEqual(await assess(r,"other",intent),result("not_found"));}));
test("corrupt intent and unavailable evidence fail closed without rewriting",()=>fixture(async c=>{const r=repo(c);await r.recordContactIntent(id,intent);await c.updateEntity({partitionKey:id,rowKey:"consent-v1:contact:"+intent.operationId,intentJson:"{}"},"Merge");const before=await rows(c);assert.deepEqual(await assess(r,id,intent),result("unavailable"));assert.deepEqual(await rows(c),before);assert.deepEqual(await assess(repo(createIsolatedVisitorTestTable("Missing"+randomUUID().replace(/-/g,""))),id,intent),result("unavailable"));}));
test("granted Staff permission remains held even with old guard disabled",()=>fixture(async c=>{assert.equal((await guard(id))?.status,503);assert.equal((await guard(id))?.error,message);assert.equal(await expose(id),false);let writes=0;const response=await start({visitorId:id,firstVisitDate:"2026-11-24",contactConsent:true,actorId:actor},{start:async()=>{writes++;throw Error("must not write");}});assert.equal(response.accepted,false);assert.equal(writes,0);await repo(c).apply(id,withdrawal);assert.equal((await guard(id))?.status,409);assert.equal(await expose(id),false);}));
test("care contact mutations held but closure attendance and notes are not held",()=>fixture(async()=>{for(const type of ["FOLLOWUP_ASSIGNED","FOLLOWUP_CONTACTED","NEXT_STEP_SELECTED"]){assert.equal(held("care",type,{}),true);assert.equal((await eventGuard(id,type,{}))?.error,message);}assert.equal(held("care","FOLLOWUP_OUTCOME_RECORDED",{outcome:"connected",nextAction:"call"}),true);assert.equal(await eventGuard(id,"FOLLOWUP_OUTCOME_RECORDED",{outcome:"closed",nextAction:"none"}),null);for(const type of ["FOLLOWUP_UNASSIGNED","ATTENDANCE_RECORDED","note.add"])assert.equal(held("care",type,{}),false);}));
test("verified Staff plan is visible but withdrawal suppresses it before enrichment", () =>
  fixture(async c => {
    let reads = 0;

    const dependencies = {
      repository: {
        listAll: async () => [plan],
        listByVisitor: async () => [plan]
      },
      getVisitor: async (visitorId: string) => {
        assert.equal(visitorId, id);
        reads++;
        return {
          visitorId,
          name: "Synthetic visitor",
          createdAt: stamp,
          updatedAt: stamp
        };
      }
    };

    // The narrow coordinated six-week workflow is
    // visible with independently verified permission.
    const visible = await queue(stamp, dependencies);

    assert.equal(visible.count, 1);
    assert.equal(reads, 1);
    assert.equal(visible.items[0].visitorId, id);
    assert.equal(visible.items[0].plan.startedBy, actor);

    assert.deepEqual(visible.consentReview, {
      restrictedCount: 0,
      unverifiedCount: 0
    });

    console.log("VERIFIED_STAFF_PLAN_VISIBLE=True");

    // Queue visibility does not release the general writer hold.
    assert.equal(await expose(id), false);
    assert.equal((await guard(id))?.error, message);
    assert.equal(held("six_week", plan.type, plan.data), true);

    console.log("GENERAL_WRITER_HOLD_PRESERVED=True");

    assert.equal(
      (await repo(c).apply(id, withdrawal)).status,
      "committed"
    );

    reads = 0;

    const restricted = await queue(stamp, dependencies);

    assert.equal(restricted.count, 0);
    assert.equal(restricted.due, 0);
    assert.equal(restricted.overdue, 0);
    assert.equal(reads, 0);

    assert.deepEqual(restricted.consentReview, {
      restrictedCount: 1,
      unverifiedCount: 0
    });

    console.log("WITHDRAWAL_SUPPRESSES_PLAN_BEFORE_ENRICHMENT=True");
  })
);
test("canonical six-week writer refuses active work but permits restrictive records and historical reads",()=>fixture(async c=>{const table=createIsolatedVisitorTestTable("HoldSixWeek"+randomUUID().replace(/-/g,""));await table.createTable();try{const writer=new SixWeekFollowupEventsRepository(table);await env({[flag]:undefined},async()=>assert.equal(await writer.append(plan),true));const before=await writer.listByVisitor(id);await repo(c).recordContactIntent(id,intent);for(const event of [plan,{...plan,eventId:"resume",type:"six_week_followup.plan_resumed" as const},{...plan,eventId:"assign",type:"six_week_followup.owner_assigned" as const,data:{ownerStaffId:actor}},{...plan,eventId:"task",type:"six_week_followup.task_completed" as const,data:{weekNumber:1}}])await assert.rejects(writer.append(event),denied);assert.deepEqual(await writer.listByVisitor(id),before);for(const event of [{...plan,eventId:"pause",type:"six_week_followup.plan_paused" as const,data:{reason:"synthetic"}},{...plan,eventId:"unassign",type:"six_week_followup.owner_assigned" as const,data:{ownerStaffId:null}},{...plan,eventId:"cancel",type:"six_week_followup.plan_cancelled" as const,data:{reason:"synthetic"}}])assert.equal(await writer.append(event),true);assert.equal((await writer.listByVisitor(id)).length,4);}finally{await table.deleteTable();}}));
test("canonical ministry writer blocks grant and intent but permits restrictive history",()=>fixture(async()=>{const table=createIsolatedVisitorTestTable("MinistryCommunicationEvents");await table.createTable();try{const writer=new MinistryCommunicationEventsRepository();const pref:MinistryCommunicationEvent={eventId:"synthetic-pref",visitorId:id,actorId:actor,occurredAt:stamp,type:"ministry_communication.preference_recorded",data:{visitorId:id,channel:"email",state:"granted",recordedAt:stamp,recordedBy:actor}};const contact:MinistryCommunicationEvent={eventId:"synthetic-contact",visitorId:id,actorId:actor,occurredAt:stamp,type:"ministry_communication.intent_recorded",data:{communicationId:"synthetic-message",visitorId:id,channel:"email",intent:"follow_up",requestedAt:stamp,requestedBy:actor,context:"care",relatedFollowupPlanId:null,notes:null}};await env({[flag]:undefined},async()=>{assert.equal(await writer.append(pref),true);assert.equal(await writer.append(contact),true);});const before=await writer.listByVisitor(id);await assert.rejects(writer.append({...pref,eventId:"new-grant"}),denied);await assert.rejects(writer.append({...contact,eventId:"new-intent"}),denied);assert.deepEqual(await writer.listByVisitor(id),before);assert.equal(await writer.append({...pref,eventId:"deny",data:{visitorId:id,channel:"email",state:"denied",recordedAt:stamp,recordedBy:actor}}),true);assert.equal(await writer.append({...contact,eventId:"cancel",type:"ministry_communication.cancelled",data:{communicationId:"synthetic-message",reason:"synthetic closure"}}),true);assert.equal((await writer.listByVisitor(id)).length,4);}finally{await table.deleteTable();}}));
test("engagement repository refuses known contact mutations before storage",()=>fixture(async()=>{const writer=new EngagementEventsRepository();for(const type of ["FOLLOWUP_ASSIGNED","FOLLOWUP_CONTACTED","NEXT_STEP_SELECTED","FOLLOWUP_OUTCOME_RECORDED"])await assert.rejects(writer.appendEvent({v:1,eventId:randomUUID(),visitorId:id,type,occurredAt:stamp,source:{system:"synthetic",actorId:actor},data:{outcome:"pending",nextAction:"call"}}),denied);}));
test("Person 360 exposes history but not contact permission while held",()=>fixture(async()=>{const key="synthetic-148g-staff-key";const staff:CanonicalStaffIdentity={staffId:actor,displayName:"Synthetic Staff",roleLabel:"Care Team",status:"active",createdAt:stamp,updatedAt:stamp,lastEventId:"synthetic-event",entraTenantId:null,entraObjectId:null,email:null,phone:null,ministryAreaId:null};await env({FEATURE_PERMANENT_VISITOR_REGISTRATION_HISTORY:"true",HOPE_API_KEY:key},async()=>{const ctx:any={};await history(ctx,{method:"GET",params:{id},headers:{"x-api-key":key,"x-hope-staff-actor-id":actor}},{readStaff:async()=>staff,readHistory:async()=>({status:"ready",registrationCount:1,truncated:false,items:[{submissionId:randomUUID(),serviceId:"visit-2026-11-24",recordedAt:stamp,visitType:"first",churchHome:null,interests:[],invitedBy:null,contactConsentAtRegistration:true,familyAttendance:{status:"not_confirmed"}}]})});assert.equal(ctx.res.status,200);assert.equal(ctx.res.body.currentConsent,"unavailable");assert.equal(ctx.res.body.history.registrationCount,1);assert.equal(ctx.res.body.history.items[0].contactConsentAtRegistration,true);});}));
test("public and admin activation fences continue to deny before runtime",async()=>env({[flag]:"true",[oldGuard]:"true",FEATURE_PERMANENT_PUBLIC_VISIT:"true",FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP:"true",FEATURE_PERMANENT_VISIT_RECOVERY_RECONCILIATION:"true",FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION:"true"},async()=>{const pub:Parameters<typeof publicEndpoint>[0]={};const admin:{res?:{status:number}}={};await publicEndpoint(pub,{method:"POST"},{runtime:async()=>{throw Error("unexpected runtime");}});await recoveryEndpoint(admin,{method:"POST"},{readStaff:async()=>{throw Error("unexpected Staff lookup");}});assert.equal(pub.res?.status,503);assert.equal(admin.res?.status,503);}));

import { insertFormationEvent } from "../src/storage/formation/formationEventsRepo";
test("direct formation insertion rejects contact mutation without altering existing rows",()=>fixture(async()=>{const t=createIsolatedVisitorTestTable("HoldFormation"+randomUUID().replace(/-/g,""));await t.createTable();try{const row={partitionKey:id,rowKey:"synthetic-history",id:"synthetic-history",visitorId:id,type:"FOLLOWUP_ASSIGNED",occurredAt:stamp,recordedAt:stamp,channel:"api",metadata:"{}"};await env({[flag]:undefined},async()=>assert.deepEqual(await insertFormationEvent(t,row),{inserted:true}));const before=await rows(t);await assert.rejects(insertFormationEvent(t,{...row,rowKey:"held"}),denied);assert.deepEqual(await rows(t),before);assert.deepEqual(await insertFormationEvent(t,{...row,rowKey:"closure",type:"FOLLOWUP_OUTCOME_RECORDED",metadata:JSON.stringify({data:{outcome:"closed",nextAction:"none"}})}),{inserted:true});}finally{await t.deleteTable();}}));

function repo(table: Parameters<typeof baseRepo>[0]) {
  return baseRepo(table, true);
}
