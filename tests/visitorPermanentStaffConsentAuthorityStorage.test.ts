import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";
import { createPermanentVisitorConsentRepository as baseRepository } from "../src/repositories/permanentVisitorConsentRepository";
import { readLatestRegistrationConsent as read } from "../src/services/followups/readLatestRegistrationConsent";
import { requireCurrentRegistrationContactPermission as guard } from "../src/services/followups/requireCurrentRegistrationContactPermission";
import { requireRegistrationEventContactPermission as eventGuard } from "../src/services/followups/requireRegistrationEventContactPermission";
import { mayExposeRegistrationContactWork as expose } from "../src/services/followups/mayExposeRegistrationContactWork";
import { startConsentProtectedSixWeekFollowup as start } from "../src/services/followups/startConsentProtectedSixWeekFollowup";
import { readSixWeekVisitorFollowupQueue as queue } from "../src/services/followups/readSixWeekVisitorFollowups";
import type { SixWeekFollowupEvent } from "../src/domain/followups/projectSixWeekVisitorFollowup";
import { getVisitorRegistrationHistory as history } from "../src/functions/getVisitorRegistrationHistory";
import type { CanonicalStaffIdentity } from "../src/domain/staff/projectStaffDirectory";
import { postPermanentPublicVisitRegistration as publicEndpoint } from "../src/functions/postPermanentPublicVisitRegistration";
import { postPermanentVisitReconciliation as recoveryEndpoint } from "../src/functions/postPermanentVisitReconciliation";
const authority = "FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY";
const oldGuard = "FEATURE_PERMANENT_VISITOR_CONSENT_GUARD";
const cutoff = "HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER";
const stamp = "2026-11-24T12:00:00.000Z";
const actor = "synthetic-148c-staff";
const id = "synthetic-148c-visitor";
const key = "synthetic-148c-staff-key";
async function environment<T>(values: Record<string,string|undefined>, run: () => Promise<T>): Promise<T> {
  const saved = Object.keys(values).map(k => [k,process.env[k]] as const);
  try { for(const [k,v] of Object.entries(values)) { if(v===undefined) delete process.env[k]; else process.env[k]=v; } return await run(); }
  finally { for(const [k,v] of saved) { if(v===undefined) delete process.env[k]; else process.env[k]=v; } }
}
async function fixture(run: (c: ReturnType<typeof createIsolatedVisitorTestTable>, v: ReturnType<typeof createIsolatedVisitorTestTable>) => Promise<void>) {
  const c=createIsolatedVisitorTestTable("VisitorFollowupEvents");
  const v=createIsolatedVisitorTestTable("Visitors");
  await c.createTable(); try { await v.createTable(); try {
    await environment({[authority]:"true",[oldGuard]:"true",[cutoff]:stamp},()=>run(c,v));
  } finally { await v.deleteTable(); } } finally { await c.deleteTable(); }
}
async function init(c: ReturnType<typeof createIsolatedVisitorTestTable>, consent: boolean) {
  const r=createPermanentVisitorConsentRepository(c);
  assert.equal((await r.apply(id,{kind:"new_profile",evidenceId:"synthetic-init",initialConsent:consent})).status,"committed"); return r;
}
async function request(r: ReturnType<typeof createPermanentVisitorConsentRepository>, consent:boolean, requestId="synthetic-request") {
  const state=await r.read(id); assert.equal(state.status,"ready"); if(state.status!=="ready") throw Error("missing authority");
  assert.equal((await r.apply(id,{kind:"public_request",expectedRevision:state.state.revision,requestId,requestedConsent:consent})).status,"committed");
}
async function legacy(v: ReturnType<typeof createIsolatedVisitorTestTable>, consent: boolean) {
  await v.createEntity({partitionKey:"VISITOR_CHECK_IN",rowKey:randomUUID(),visitorId:id,recordedAt:stamp,registrationDetailsJson:JSON.stringify({version:1,contactConsent:consent})});
}
test("disabled authority preserves legacy receipt reading and disabled guard",()=>fixture(async(c,v)=>{
  await init(c,false); await legacy(v,true);
  for(const flag of [undefined,"false","TRUE",""]) await environment({[authority]:flag},async()=>{assert.equal(await read(id),"granted");assert.equal(await guard(id),null);});
  await environment({[authority]:undefined,[oldGuard]:undefined},async()=>assert.equal(await guard(id,async()=>"declined"),null));
}));
test("durable grant ignores old receipt decline",()=>fixture(async(c,v)=>{await init(c,true);await legacy(v,false);assert.equal(await read(id),"granted");assert.equal((await guard(id))?.status,503);assert.equal(await expose(id),false);}));
test("durable decline ignores old receipt grant",()=>fixture(async(c,v)=>{await init(c,false);await legacy(v,true);assert.equal(await read(id),"declined");assert.equal((await guard(id))?.status,409);assert.equal(await expose(id),false);}));
test("pending withdrawal suppresses without changing effective grant",()=>fixture(async(c)=>{const r=await init(c,true);await request(r,false);assert.equal(await read(id),"pending_verification");assert.equal((await guard(id))?.status,409);assert.equal(await expose(id),false);const s=await r.read(id);assert.equal(s.status,"ready");if(s.status!=="ready")throw Error("state");assert.equal(s.state.effective,"granted");}));
test("pending grant never authorizes contact",()=>fixture(async(c)=>{const r=await init(c,false);await request(r,true);assert.equal(await read(id),"pending_verification");assert.equal((await guard(id))?.status,409);}));
test("missing authority and unknown state cannot use legacy grant",()=>fixture(async(c,v)=>{await legacy(v,true);assert.equal(await read(id),"unavailable");assert.equal((await guard(id))?.status,503);await assert.rejects(expose(id));const r=createPermanentVisitorConsentRepository(c);assert.equal((await r.apply(id,{kind:"existing_profile",evidenceId:"synthetic-existing"})).status,"committed");assert.equal(await read(id),"unavailable");}));
test("invalid cutover and missing table fail closed",()=>fixture(async(c)=>{await init(c,true);for(const value of [undefined,"invalid",""])await environment({[cutoff]:value},async()=>assert.equal((await guard(id))?.status,503));await c.deleteTable();try{assert.equal(await read(id),"unavailable");assert.equal((await guard(id))?.status,503);}finally{await c.createTable();}}));
test("missing receipt denies even when authority head appears granted",()=>fixture(async(c)=>{await init(c,true);await c.deleteEntity(id,"consent-v1:op:synthetic-init");assert.equal(await read(id),"unavailable");assert.equal((await guard(id))?.status,503);}));
test("authority flag cannot be bypassed by disabling legacy guard",()=>fixture(async(c)=>{const r=await init(c,true);await request(r,false);await environment({[oldGuard]:"false"},async()=>{assert.equal((await guard(id))?.status,409);assert.equal((await guard(id,async()=>"legacy_no_evidence"))?.status,503);});}));
test("contact event guard denies contact and assignment but preserves closure",()=>fixture(async(c)=>{const r=await init(c,true);await request(r,false);for(const kind of ["FOLLOWUP_CONTACTED","FOLLOWUP_ASSIGNED","NEXT_STEP_SELECTED"])assert.equal((await eventGuard(id,kind,{}))?.status,409);assert.equal(await eventGuard(id,"FOLLOWUP_OUTCOME_RECORDED",{outcome:"closed",nextAction:"none"}),null);assert.equal(await eventGuard(id,"ATTENDANCE_RECORDED",{}),null);}));
test("staff enrollment refuses pending consent and legacy fallback before writer",()=>fixture(async(c)=>{const r=await init(c,true);await request(r,false);let calls=0;const input={visitorId:id,firstVisitDate:"2026-11-24",contactConsent:true,actorId:actor};const writer=async()=>{calls++;throw Error("unexpected writer");};const result=await start(input,{start:writer});assert.equal(result.accepted,false);if(result.accepted===false)assert.equal(result.status,409);const fallback=await start(input,{start:writer,readConsent:async()=>"legacy_no_evidence"});assert.equal(fallback.accepted,false);assert.equal(calls,0);}));
test("six-week queue suppresses pending plan before profile enrichment",()=>fixture(async(c)=>{const r=await init(c,true);await request(r,false);const e:SixWeekFollowupEvent={eventId:"synthetic-plan",visitorId:id,type:"six_week_followup.plan_started",occurredAt:stamp,actorId:"system:permanent-visitor-registration",data:{firstVisitDate:"2026-11-24",ownerStaffId:null,contactConsent:true,preferredContactMethod:null}};let reads=0;const result=await queue(stamp,{repository:{listByVisitor:async()=>[e],listAll:async()=>[e]},getVisitor:async()=>{reads++;return null;}});assert.equal(result.count,0);assert.equal(reads,0);assert.equal(result.due,0);assert.equal(result.overdue,0);}));
test("Person 360 wire status stays compatible and historical attendance remains visible",()=>fixture(async(c)=>{const r=await init(c,true);await request(r,false);const staff:CanonicalStaffIdentity={staffId:actor,displayName:"Synthetic Staff",roleLabel:"Care Team",status:"active",createdAt:stamp,updatedAt:stamp,lastEventId:"synthetic-event",entraTenantId:null,entraObjectId:null,email:null,phone:null,ministryAreaId:null};await environment({FEATURE_PERMANENT_VISITOR_REGISTRATION_HISTORY:"true",HOPE_API_KEY:key},async()=>{const ctx:any={};await history(ctx,{method:"GET",params:{id},headers:{"x-api-key":key,"x-hope-staff-actor-id":actor}},{readStaff:async()=>staff,readHistory:async()=>({status:"ready",registrationCount:1,truncated:false,items:[{submissionId:randomUUID(),serviceId:"visit-2026-11-24",recordedAt:stamp,visitType:"first",churchHome:null,interests:[],invitedBy:null,contactConsentAtRegistration:true,familyAttendance:{status:"not_confirmed"}}]})});assert.equal(ctx.res.status,200);assert.equal(ctx.res.body.currentConsent,"unavailable");assert.equal(ctx.res.body.history.registrationCount,1);assert.equal(ctx.res.body.history.items[0].contactConsentAtRegistration,true);assert.equal(ctx.res.headers["cache-control"],"no-store");});}));
test("both HTTP activation fences remain enforced",async()=>environment({[authority]:"true",[oldGuard]:"true",FEATURE_PERMANENT_PUBLIC_VISIT:"true",FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP:"true",FEATURE_PERMANENT_VISIT_RECOVERY_RECONCILIATION:"true",FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION:"true"},async()=>{const pub:Parameters<typeof publicEndpoint>[0]={};const admin:{res?:{status:number}}={};await publicEndpoint(pub,{method:"POST"},{runtime:async()=>{throw Error("unexpected runtime");}});await recoveryEndpoint(admin,{method:"POST"},{readStaff:async()=>{throw Error("unexpected Staff lookup");}});assert.equal(pub.res?.status,503);assert.equal(admin.res?.status,503);}));

function createPermanentVisitorConsentRepository(
  table: Parameters<typeof baseRepository>[0]
) {
  return baseRepository(table, true);
}


test("mixed queue preserves verified public work without releasing legacy or unverified plans", () =>
  fixture(async c => {
    await init(c, true);

    const missingId = "synthetic-unverified-legacy";
    const declinedId = "synthetic-declined-public";
    const heldId = "synthetic-held-legacy";

    const authority =
      createPermanentVisitorConsentRepository(c);

    assert.equal((await authority.apply(declinedId, {
      kind: "new_profile",
      evidenceId: "synthetic-declined-init",
      initialConsent: false
    })).status, "committed");

    assert.equal((await authority.apply(heldId, {
      kind: "new_profile",
      evidenceId: "synthetic-held-init",
      initialConsent: true
    })).status, "committed");

    const publicActor =
      "system:permanent-visitor-registration";

    const makePlan = (
      visitorId: string,
      actorId: string
    ): SixWeekFollowupEvent => ({
      eventId: `synthetic-plan-${visitorId}`,
      visitorId,
      actorId,
      type: "six_week_followup.plan_started",
      occurredAt: stamp,
      data: {
        firstVisitDate: "2026-11-24",
        ownerStaffId: null,
        contactConsent: true,
        preferredContactMethod: null
      }
    });

    const events = [
      makePlan(id, publicActor),
      makePlan(missingId, "synthetic-legacy-staff"),
      makePlan(declinedId, publicActor),
      makePlan(heldId, "synthetic-legacy-staff")
    ];

    const enriched: string[] = [];

    const result = await queue(stamp, {
      repository: {
        listAll: async () => events,
        listByVisitor: async visitorId =>
          events.filter(event => event.visitorId === visitorId)
      },
      getVisitor: async visitorId => {
        enriched.push(visitorId);

        return {
          visitorId,
          name: "Synthetic visitor",
          email: "synthetic@example.invalid",
          phone: "5550100",
          createdAt: stamp,
          updatedAt: stamp
        };
      }
    });

    assert.equal(result.count, 1);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].visitorId, id);

    assert.deepEqual(result.consentReview, {
      restrictedCount: 2,
      unverifiedCount: 1
    });

    assert.deepEqual(enriched, [id]);
    assert.equal(events.length, 4);

    console.log("MIXED_QUEUE_VERIFIED_WORK_PRESERVED=True");
    console.log("UNVERIFIED_AND_RESTRICTED_COUNTS_VERIFIED=True");
  })
);