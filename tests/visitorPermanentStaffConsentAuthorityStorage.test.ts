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
import { readSixWeekVisitorFollowupQueue as queue, readSixWeekVisitorFollowup as readPlan } from "../src/services/followups/readSixWeekVisitorFollowups";
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


test("mixed queue preserves verified public and Staff work", () =>
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
      kind: "existing_profile",
      evidenceId: "synthetic-held-init"
    })).status, "committed");

    assert.equal((await authority.apply(heldId, {
      kind: "public_request",
      expectedRevision: 1,
      requestId: "synthetic-staff-grant-request",
      requestedConsent: true
    })).status, "committed");

    assert.equal((await authority.apply(heldId, {
      kind: "verified_staff_decision",
      expectedRevision: 2,
      decisionId: "synthetic-staff-grant-decision",
      pendingRequestId: "synthetic-staff-grant-request",
      actorId: actor,
      decision: "granted"
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

    assert.equal(result.count, 2);
    assert.equal(result.items.length, 2);

    assert.deepEqual(
      result.items.map(item => item.visitorId).sort(),
      [id, heldId].sort()
    );

    assert.deepEqual(result.consentReview, {
      restrictedCount: 1,
      unverifiedCount: 1
    });

    assert.deepEqual(enriched.sort(), [id, heldId].sort());

    const detailRepository = {
      listAll: async () => events,
      listByVisitor: async (visitorId: string) =>
        events.filter(event => event.visitorId === visitorId)
    };

    const publicPlan = await readPlan(
      id, stamp, { repository: detailRepository }
    );

    const staffPlan = await readPlan(
      heldId, stamp, { repository: detailRepository }
    );

    assert.equal(
      publicPlan?.staffWorkflow,
      "consent_protected_public"
    );

    assert.equal(
      staffPlan?.staffWorkflow,
      "consent_protected_staff"
    );

    for (const denied of [missingId, declinedId]) {
      await assert.rejects(() => readPlan(
        denied, stamp, { repository: detailRepository }
      ));
    }

    assert.equal((await authority.apply(heldId, {
      kind: "public_request",
      expectedRevision: 3,
      requestId: "synthetic-staff-withdrawal",
      requestedConsent: false
    })).status, "committed");

    await assert.rejects(() => readPlan(
      heldId, stamp, { repository: detailRepository }
    ));

    console.log("PUBLIC_AND_STAFF_QUEUE_VISIBILITY_VERIFIED=True");
    console.log("PERSON_360_WORKFLOW_MARKERS_VERIFIED=True");
    console.log("MISSING_DECLINED_PENDING_CONSENT_DENIED=True");
    assert.equal(events.length, 4);

    console.log("MIXED_QUEUE_VERIFIED_WORK_PRESERVED=True");
    console.log("UNVERIFIED_AND_RESTRICTED_COUNTS_VERIFIED=True");
  })
);

test("authority-mode Staff HTTP lifecycle uses canonical actors and durable commands", () =>
  fixture(async c => {
    const { SixWeekFollowupEventsRepository } =
      await import("../src/repositories/sixWeekFollowupEventsRepository");

    const {
      assignSixWeekFollowupOwner,
      changeSixWeekFollowupStatus,
      recordSixWeekTaskOutcome
    } = await import("../src/services/followups/sixWeekVisitorFollowupCommands");

    const { resolveSixWeekActorAuthorization } =
      await import("../src/functions/_shared/sixWeekStaffActor");

    const { postSixWeekVisitorFollowupOwner } =
      await import("../src/functions/postSixWeekVisitorFollowupOwner");

    const { postSixWeekVisitorFollowupStatus } =
      await import("../src/functions/postSixWeekVisitorFollowupStatus");

    const { postSixWeekVisitorFollowupTaskOutcome } =
      await import("../src/functions/postSixWeekVisitorFollowupTaskOutcome");

    const visitorId = "synthetic-http-visitor";
    const ownerId = "synthetic-http-owner";
    const otherId = "synthetic-http-other";
    const submissionId = "synthetic-http-registration";

    const authority =
      createPermanentVisitorConsentRepository(c);

    const repository =
      new SixWeekFollowupEventsRepository(c);

    const initialized = await authority.apply(visitorId, {
      kind: "new_profile",
      evidenceId: submissionId,
      initialConsent: true
    });

    assert.equal(initialized.status, "committed");

    const evidence = {
      visitorId,
      submissionId,
      serviceId: "synthetic-general-visit",
      visitDate: stamp.slice(0, 10)
    };

    const started: SixWeekFollowupEvent = {
      eventId: `evt-public-${submissionId}`,
      visitorId,
      type: "six_week_followup.plan_started",
      occurredAt: stamp,
      actorId: "system:permanent-visitor-registration",
      data: {
        firstVisitDate: evidence.visitDate,
        ownerStaffId: null,
        contactConsent: true,
        preferredContactMethod: null
      }
    };

    assert.equal(
      await authority.appendPublicEnrollment(evidence, started),
      "enrolled"
    );

    const readStaff = async (staffId: string) => {
      if (![ownerId, otherId, "synthetic-http-inactive"].includes(staffId)) {
        return null;
      }

      return {
        staffId,
        displayName: "Synthetic Staff",
        roleLabel: "Care Team",
        status: staffId === "synthetic-http-inactive"
          ? "inactive" as const : "active" as const,
        createdAt: stamp,
        updatedAt: stamp,
        lastEventId: "synthetic-staff-event",
        entraTenantId: null,
        entraObjectId: null,
        email: null,
        phone: null,
        ministryAreaId: null
      };
    };

    let eventCounter = 0;

    const dependencies = {
      repository,
      readActor: readStaff,
      readAssignee: readStaff,
      newEventId: () => `synthetic-http-event-${++eventCounter}`,
      now: () => new Date(
        Date.parse(stamp) + (eventCounter + 1) * 1000
      ).toISOString()
    };

    const resolveActor = (
      req: Parameters<typeof resolveSixWeekActorAuthorization>[0]
    ) => resolveSixWeekActorAuthorization(
      req,
      readStaff,
      async () => ({ ok: true, actorId: null })
    );

    const previousKey = process.env.HOPE_API_KEY;

    process.env.HOPE_API_KEY = "local-test-key-only";

    function request(
      actorId: string | null,
      body: Record<string, unknown>,
      weekNumber = 1,
      apiKey = "local-test-key-only"
    ) {
      return {
        headers: {
          "x-api-key": apiKey,
          ...(actorId
            ? { "x-hope-staff-actor-id": actorId }
            : {})
        },
        params: { visitorId, weekNumber: String(weekNumber) },
        body
      };
    }

    function context(): any {
      return {
        res: undefined,
        log: Object.assign(() => undefined, {
          error: () => undefined,
          warn: () => undefined,
          info: () => undefined
        })
      };
    }

    async function owner(req: ReturnType<typeof request>) {
      const ctx = context();

      await postSixWeekVisitorFollowupOwner(ctx, req, {
        resolveActor,
        assignOwner: input =>
          assignSixWeekFollowupOwner(input, dependencies)
      });

      return ctx.res;
    }

    async function status(req: ReturnType<typeof request>) {
      const ctx = context();

      await postSixWeekVisitorFollowupStatus(ctx, req, {
        resolveActor,
        command: input =>
          changeSixWeekFollowupStatus(input, dependencies)
      });

      return ctx.res;
    }

    async function task(req: ReturnType<typeof request>) {
      const ctx = context();

      await postSixWeekVisitorFollowupTaskOutcome(ctx, req, {
        resolveActor,
        command: input =>
          recordSixWeekTaskOutcome(input, dependencies)
      });

      return ctx.res;
    }

    try {
      assert.equal((await owner(request(
        ownerId, { ownerStaffId: ownerId }, 1, "wrong-key"
      ))).status, 401);

      assert.equal((await owner(request(
        null, { ownerStaffId: ownerId, actorId: ownerId }
      ))).status, 401);

      assert.equal((await owner(request(
        "synthetic-http-inactive", { ownerStaffId: ownerId }
      ))).status, 403);

      assert.equal(
        (await repository.listByVisitor(visitorId)).length,
        1
      );

      const claimed = await owner(request(ownerId, {
        ownerStaffId: ownerId,
        actorId: otherId
      }));

      assert.equal(claimed.status, 202);
      assert.equal(claimed.body.plan.ownerStaffId, ownerId);

      const outcome = {
        disposition: "completed",
        contactMethod: "none",
        outcome: "Synthetic task completed",
        actorId: ownerId
      };

      assert.equal(
        (await task(request(otherId, outcome))).status,
        403
      );

      const completed = await task(request(ownerId, outcome));

      assert.equal(completed.status, 202);
      assert.equal(completed.body.plan.tasks[0].status, "completed");

      const paused = await status(request(ownerId, {
        action: "pause",
        reason: "Synthetic pause"
      }));

      assert.equal(paused.status, 202);
      assert.equal(paused.body.plan.status, "paused");

      const resumed = await status(request(ownerId, {
        action: "resume"
      }));

      assert.equal(resumed.status, 202);
      assert.equal(resumed.body.plan.status, "active");

      const withdrawn = await authority.apply(visitorId, {
        kind: "public_request",
        expectedRevision: 1,
        requestId: "synthetic-http-withdrawal",
        requestedConsent: false
      });

      assert.equal(withdrawn.status, "committed");

      const before = await repository.listByVisitor(visitorId);

      assert.equal(
        (await task(request(ownerId, outcome, 2))).status,
        409
      );

      const after = await repository.listByVisitor(visitorId);

      assert.deepEqual(after, before);

      const taskEvent = after.find(event =>
        event.type === "six_week_followup.task_completed"
      );

      assert.equal(taskEvent?.actorId, ownerId);

      console.log("AUTHORITY_HTTP_OWNER_CLAIM_VERIFIED=True");
      console.log("AUTHORITY_HTTP_TASK_OUTCOME_VERIFIED=True");
      console.log("AUTHORITY_HTTP_PAUSE_RESUME_VERIFIED=True");
      console.log("AUTHORITY_HTTP_WITHDRAWAL_DENIAL_VERIFIED=True");
      console.log("CANONICAL_HTTP_ACTOR_VERIFIED=True");

    } finally {
      if (previousKey === undefined) {
        delete process.env.HOPE_API_KEY;
      } else {
        process.env.HOPE_API_KEY = previousKey;
      }
    }
  })
);

test("administrator consent decisions are authorized durable and revision bound", () =>
  fixture(async c => {
    const { permanentVisitorStaffConsent } =
      await import("../src/functions/permanentVisitorStaffConsent");

    const visitorId = "synthetic-admin-consent-visitor";
    const adminId = "synthetic-consent-admin";
    const adminKey = "synthetic-consent-admin-key-only";

    const feature =
      "FEATURE_PERMANENT_VISITOR_STAFF_CONSENT_DECISION";

    const repository =
      createPermanentVisitorConsentRepository(c);

    const readStaff = async (staffId: string) => {
      if (![adminId, "synthetic-inactive-admin"].includes(staffId)) {
        return null;
      }

      return {
        staffId,
        displayName: "Synthetic Administrator",
        roleLabel: "Administrator",
        status: staffId === adminId
          ? "active" as const
          : "inactive" as const,
        createdAt: stamp,
        updatedAt: stamp,
        lastEventId: "synthetic-admin-event",
        entraTenantId: null,
        entraObjectId: null,
        email: null,
        phone: null,
        ministryAreaId: null
      };
    };

    const initial = await repository.apply(visitorId, {
      kind: "existing_profile",
      evidenceId: "synthetic-existing-profile"
    });

    assert.equal(initial.status, "committed");

    const requested = await repository.apply(visitorId, {
      kind: "public_request",
      expectedRevision: 1,
      requestId: "synthetic-grant-request",
      requestedConsent: true
    });

    assert.equal(requested.status, "committed");

    const decision = {
      expectedRevision: 2,
      decisionId: "synthetic-verified-grant",
      pendingRequestId: "synthetic-grant-request",
      decision: "granted",
      confirmation: "visitor_choice_verified"
    };

    async function invoke(
      method: string,
      body?: Record<string, unknown>,
      suppliedKey = adminKey,
      actorId = adminId,
      targetVisitorId = visitorId
    ) {
      const ctx: any = {};

      await permanentVisitorStaffConsent(ctx, {
        method,
        params: { visitorId: targetVisitorId },
        headers: {
          "x-admin-api-key": suppliedKey,
          "x-hope-admin-actor-id": actorId
        },
        body
      }, {
        readStaff,
        repository
      });

      return ctx.res;
    }

    await environment({
      [feature]: "false",
      HOPE_ADMIN_API_KEY: adminKey,
      HOPE_ADMIN_STAFF_IDS: `${adminId},synthetic-inactive-admin`,
      HOPE_API_KEY: "synthetic-distinct-api-key"
    }, async () => {
      assert.equal((await invoke("GET")).status, 404);
    });

    await environment({
      [feature]: "true",
      HOPE_ADMIN_API_KEY: adminKey,
      HOPE_ADMIN_STAFF_IDS: `${adminId},synthetic-inactive-admin`,
      HOPE_API_KEY: "synthetic-distinct-api-key"
    }, async () => {
      const before = await repository.read(visitorId);

      for (const response of [
        await invoke("POST", decision, "wrong-key"),
        await invoke("POST", decision, adminKey, "unknown-admin"),
        await invoke("POST", decision, adminKey, "synthetic-inactive-admin")
      ]) {
        assert.ok(
          [401, 403].includes(response.status),
          `Unexpected authorization response: ${response.status}`
        );
      }

      assert.deepEqual(
        await repository.read(visitorId),
        before
      );

      console.log("UNAUTHORIZED_CONSENT_DECISIONS_DENIED=True");

      const pending = await invoke("GET");

      assert.equal(pending.status, 200);
      assert.equal(pending.body.effective, "unknown");
      assert.equal(pending.body.revision, 2);
      assert.equal(
        pending.body.pending.requestId,
        "synthetic-grant-request"
      );

      assert.equal((await invoke("POST", {
        ...decision,
        actorId: "forged-actor"
      })).status, 400);

      assert.equal((await invoke("POST", {
        ...decision,
        confirmation: "unverified"
      })).status, 400);

      assert.equal((await invoke("POST", {
        ...decision,
        expectedRevision: 1
      })).status, 409);

      assert.equal((await invoke("POST", {
        ...decision,
        pendingRequestId: "wrong-request"
      })).status, 409);

      assert.deepEqual(
        await repository.read(visitorId),
        before
      );

      const granted = await invoke("POST", decision);

      assert.equal(granted.status, 200);
      assert.equal(granted.body.status, "committed");
      assert.equal(granted.body.recordedRevision, 3);

      const receipt = await repository.inspectOperation(
        visitorId, decision.decisionId
      );

      assert.equal(receipt.status, "found");

      if (receipt.status === "found") {
        assert.equal(
          receipt.operation.kind,
          "verified_staff_decision"
        );

        if (receipt.operation.kind === "verified_staff_decision") {
          assert.equal(receipt.operation.actorId, adminId);
        }
      }

      const replayed = await invoke("POST", decision);

      assert.equal(replayed.status, 200);
      assert.equal(replayed.body.status, "replayed");
      assert.equal(replayed.body.recordedRevision, 3);

      const withdrawal = await repository.apply(visitorId, {
        kind: "public_request",
        expectedRevision: 3,
        requestId: "synthetic-new-withdrawal",
        requestedConsent: false
      });

      assert.equal(withdrawal.status, "committed");

      const historicalReplay = await invoke("POST", decision);

      assert.equal(historicalReplay.status, 200);
      assert.equal(historicalReplay.body.status, "replayed");

      const withdrawn = await invoke("GET");

      assert.equal(withdrawn.body.revision, 4);
      assert.equal(withdrawn.body.pending.kind, "withdrawal");

      const declined = await invoke("POST", {
        expectedRevision: 4,
        decisionId: "synthetic-verified-decline",
        pendingRequestId: "synthetic-new-withdrawal",
        decision: "declined",
        confirmation: "visitor_choice_verified"
      });

      assert.equal(declined.status, 200);

      const finalState = await invoke("GET");

      assert.equal(finalState.body.effective, "declined");
      assert.equal(finalState.body.pending, null);
      assert.equal(finalState.body.revision, 5);

      const { SixWeekFollowupEventsRepository } =
        await import("../src/repositories/sixWeekFollowupEventsRepository");

      const plans = new SixWeekFollowupEventsRepository(c);

      assert.equal(
        (await plans.listByVisitor(visitorId)).length,
        0
      );

      const historicalId = "synthetic-historical-admin-visitor";

      const historicalDecision = {
        expectedRevision: 1,
        decisionId: "synthetic-historical-admin-decision",
        pendingRequestId: null,
        decision: "granted",
        confirmation: "visitor_choice_verified"
      };

      // The decision endpoint cannot initialize missing authority.
      assert.equal((await invoke(
        "POST", historicalDecision, adminKey, adminId, historicalId
      )).status, 503);

      assert.equal(
        (await repository.read(historicalId)).status,
        "not_initialized"
      );

      assert.equal((await repository.apply(historicalId, {
        kind: "existing_profile",
        evidenceId: "synthetic-historical-admin-init"
      })).status, "committed");

      const historicalBefore = await repository.read(historicalId);

      for (const [key, staff] of [
        ["wrong-key", adminId],
        [adminKey, "unknown-admin"],
        [adminKey, "synthetic-inactive-admin"]
      ]) {
        const response = await invoke(
          "POST", historicalDecision, key, staff, historicalId
        );

        assert.ok([401, 403].includes(response.status));
      }

      assert.deepEqual(
        await repository.read(historicalId),
        historicalBefore
      );

      assert.equal((await invoke("POST", {
        ...historicalDecision,
        confirmation: "unverified"
      }, adminKey, adminId, historicalId)).status, 400);

      assert.equal((await invoke("POST", {
        ...historicalDecision,
        actorId: "forged-actor"
      }, adminKey, adminId, historicalId)).status, 400);

      const firstDecision = await invoke(
        "POST", historicalDecision, adminKey, adminId, historicalId
      );

      assert.equal(firstDecision.status, 200);
      assert.equal(firstDecision.body.status, "committed");
      assert.equal(firstDecision.body.recordedRevision, 2);

      const historicalReceipt = await repository.inspectOperation(
        historicalId, historicalDecision.decisionId
      );

      assert.equal(historicalReceipt.status, "found");

      if (historicalReceipt.status !== "found" ||
          historicalReceipt.operation.kind !== "verified_staff_decision") {
        throw Error("Missing canonical Staff decision receipt");
      }

      assert.equal(historicalReceipt.operation.actorId, adminId);
      assert.equal(historicalReceipt.operation.pendingRequestId, null);

      const exactReplay = await invoke(
        "POST", historicalDecision, adminKey, adminId, historicalId
      );

      assert.equal(exactReplay.status, 200);
      assert.equal(exactReplay.body.status, "replayed");

      assert.equal((await repository.apply(historicalId, {
        kind: "public_request",
        expectedRevision: 2,
        requestId: "synthetic-historical-withdrawal",
        requestedConsent: false
      })).status, "committed");

      assert.equal((await invoke("POST", {
        ...historicalDecision,
        expectedRevision: 3,
        decisionId: "synthetic-forbidden-historical-grant"
      }, adminKey, adminId, historicalId)).status, 409);

      const currentHistorical = await invoke(
        "GET", undefined, adminKey, adminId, historicalId
      );

      assert.equal(currentHistorical.body.pending.kind, "withdrawal");
      assert.equal(
        (await plans.listByVisitor(historicalId)).length,
        0
      );

      console.log("HISTORICAL_ADMIN_AUTHORIZATION_VERIFIED=True");
      console.log("HISTORICAL_DECISION_RECEIPT_VERIFIED=True");
      console.log("HISTORICAL_WITHDRAWAL_PROTECTED=True");
      console.log("NO_AUTOMATIC_HISTORICAL_ENROLLMENT=True");

      console.log("ADMIN_CONSENT_DECISION_VERIFIED=True");
      console.log("EXACT_DECISION_REPLAY_VERIFIED=True");
      console.log("STALE_DECISION_DENIED=True");
      console.log("NEW_WITHDRAWAL_PRESERVED=True");
      console.log("NO_AUTOMATIC_PLAN_CREATION_VERIFIED=True");
    });
  })
);

test("atomic Staff enrollment preserves authorization consent and existing plans", () =>
  fixture(async c => {
    const { SixWeekFollowupEventsRepository } =
      await import("../src/repositories/sixWeekFollowupEventsRepository");

    const { startSixWeekVisitorFollowup } =
      await import("../src/services/followups/sixWeekVisitorFollowupCommands");

    const authority = createPermanentVisitorConsentRepository(c);
    const repository = new SixWeekFollowupEventsRepository(c);

    const grantedId = "synthetic-staff-enrollment-granted";
    const declinedId = "synthetic-staff-enrollment-declined";
    const pendingId = "synthetic-staff-enrollment-pending";
    const missingId = "synthetic-staff-enrollment-missing";
    const racingId = "synthetic-staff-enrollment-race";

    async function initialize(
      visitorId: string,
      decision: "granted" | "declined"
    ) {
      assert.equal((await authority.apply(visitorId, {
        kind: "existing_profile",
        evidenceId: "synthetic-historical-init"
      })).status, "committed");

      assert.equal((await authority.apply(visitorId, {
        kind: "verified_staff_decision",
        expectedRevision: 1,
        decisionId: "synthetic-verified-decision",
        pendingRequestId: null,
        actorId: "synthetic-authorized-admin",
        decision
      })).status, "committed");
    }

    await initialize(grantedId, "granted");
    await initialize(declinedId, "declined");
    await initialize(pendingId, "granted");
    await initialize(racingId, "granted");

    assert.equal((await authority.apply(pendingId, {
      kind: "public_request",
      expectedRevision: 2,
      requestId: "synthetic-pending-withdrawal",
      requestedConsent: false
    })).status, "committed");

    const dependencies = {
      repository,
      visitorExists: async () => true,
      readActor: async (staffId: string) => ({
        staffId,
        status: "active" as const
      }),
      readAssignee: async (staffId: string) => ({
        staffId,
        status: "active" as const
      }),
      now: () => stamp,
      newEventId: () => `synthetic-start-${randomUUID()}`
    };

    function input(visitorId: string) {
      return {
        visitorId,
        actorId: actor,
        firstVisitDate: "2026-11-24",
        contactConsent: true,
        ownerStaffId: actor
      };
    }

    const inactive = await startSixWeekVisitorFollowup(
      input(grantedId), {
        ...dependencies,
        readActor: async staffId => ({
          staffId,
          status: "inactive" as const
        })
      }
    );

    assert.equal(inactive.accepted, false);

    const inactiveOwner = await startSixWeekVisitorFollowup(
      input(grantedId), {
        ...dependencies,
        readAssignee: async staffId => ({
          staffId,
          status: "inactive" as const
        })
      }
    );

    assert.equal(inactiveOwner.accepted, false);
    assert.equal((await repository.listByVisitor(grantedId)).length, 0);

    for (const [visitorId, status] of [
      [declinedId, 409],
      [pendingId, 409],
      [missingId, 503]
    ] as const) {
      const denied = await startSixWeekVisitorFollowup(
        input(visitorId), dependencies
      );

      assert.equal(denied.accepted, false);
      assert.equal(denied.status, status);
      assert.equal((await repository.listByVisitor(visitorId)).length, 0);
    }

    console.log("STAFF_ENROLLMENT_DENIALS_VERIFIED=True");

    const result = await startSixWeekVisitorFollowup(
      input(grantedId), dependencies
    );

    assert.equal(result.accepted, true);
    assert.equal(result.status, 201);

    if (!result.accepted) {
      throw Error("Expected Staff enrollment");
    }

    assert.equal(result.plan.startedBy, actor);
    assert.equal(result.plan.ownerStaffId, actor);
    assert.equal(result.plan.tasks.length, 6);

    const original = await repository.listByVisitor(grantedId);

    assert.equal(original.length, 1);

    const duplicate = await startSixWeekVisitorFollowup(
      input(grantedId), dependencies
    );

    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.status, 409);

    assert.deepEqual(
      await repository.listByVisitor(grantedId),
      original
    );

    console.log("VERIFIED_STAFF_ENROLLMENT_PERSISTED=True");
    console.log("EXISTING_PLAN_NOT_RESET=True");

    let injected = false;

    const racingAuthority = baseRepository({
      getEntity: c.getEntity.bind(c),
      listEntities: c.listEntities.bind(c),
      submitTransaction: async actions => {
        assert.equal(injected, false);
        injected = true;

        assert.equal((await authority.apply(racingId, {
          kind: "public_request",
          expectedRevision: 2,
          requestId: "synthetic-concurrent-withdrawal",
          requestedConsent: false
        })).status, "committed");

        return c.submitTransaction(actions);
      }
    }, true);

    const raced = await startSixWeekVisitorFollowup(
      input(racingId), {
        ...dependencies,
        repository: {
          append: repository.append.bind(repository),
          listByVisitor: repository.listByVisitor.bind(repository),
          startConsentProtectedPlan: event =>
            racingAuthority.appendStaffEnrollment(event)
        }
      }
    );

    assert.equal(injected, true);
    assert.equal(raced.accepted, false);
    assert.equal(raced.status, 409);
    assert.equal((await repository.listByVisitor(racingId)).length, 0);

    console.log("CONCURRENT_WITHDRAWAL_BLOCKS_ENROLLMENT=True");
  })
);
