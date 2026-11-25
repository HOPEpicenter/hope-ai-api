import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";
import { createPermanentVisitorConsentRepository as baseRepository } from "../src/repositories/permanentVisitorConsentRepository";
import { createPermanentVisitorConsentRuntime as baseRuntime } from "../src/services/followups/permanentVisitorConsentRuntime";
import { recordVisitorArrival as arrival } from "../src/services/visitors/recordVisitorArrival";
import { recordVisitorFamilyCheckIn as familyArrival } from "../src/services/visitors/recordVisitorFamilyCheckIn";
import { requireCurrentRegistrationContactPermission as guard } from "../src/services/followups/requireCurrentRegistrationContactPermission";
import { permitsContactWork } from "../src/domain/followups/permanentVisitorConsentAuthority";
import { postPermanentPublicVisitRegistration as publicEndpoint } from "../src/functions/postPermanentPublicVisitRegistration";
import { postPermanentVisitReconciliation as recoveryEndpoint } from "../src/functions/postPermanentVisitReconciliation";
const id="synthetic-148d-visitor", cutoff="2020-01-01T00:00:00.000Z", serviceId="visit-2026-11-24";
const no={status:"unavailable"} as const;
const input=(consent=false,submissionId=randomUUID())=>({submissionId,serviceId,name:"Synthetic Visitor",email:"synthetic@example.invalid",profile:{visitType:"returning" as const,churchHome:null,interests:[],invitedBy:null,contactConsent:consent}});
const family={guardianName:"Synthetic Visitor",guardianDeclaration:true,children:[{firstName:"Child",ageGroup:"6-11"}]};
const authority="FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY", oldGuard="FEATURE_PERMANENT_VISITOR_CONSENT_GUARD", cutoverKey="HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER";
async function environment<T>(values:Record<string,string|undefined>,run:()=>Promise<T>):Promise<T>{
  const saved=Object.keys(values).map(k=>[k,process.env[k]] as const);
  try{for(const [k,v] of Object.entries(values)){if(v===undefined)delete process.env[k];else process.env[k]=v;}return await run();}
  finally{for(const [k,v] of saved){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
}
async function fixture(run:(v:TableClient,c:TableClient)=>Promise<void>){
  const v=createIsolatedVisitorTestTable("Visitors"),c=createIsolatedVisitorTestTable("VisitorFollowupEvents");
  await v.createTable();try{await c.createTable();try{await environment({[authority]:"true",[oldGuard]:"false",[cutoverKey]:cutoff},()=>run(v,c));}finally{await c.deleteTable();}}finally{await v.deleteTable();}
}
async function seed(v:TableClient,c:TableClient,granted=true){
  await v.createEntity({partitionKey:"VISITOR",rowKey:id,name:"Synthetic Visitor",email:"synthetic@example.invalid",emailLower:"synthetic@example.invalid",createdAt:cutoff});
  assert.equal((await repository(c).apply(id,{kind:"new_profile",evidenceId:"synthetic-seed",initialConsent:granted})).status,"committed");
}
async function state(c:TableClient,visitorId=id){const s=await repository(c).read(visitorId);assert.equal(s.status,"ready");if(s.status!=="ready")throw Error("authority missing");return s.state;}
const matched=async()=>({status:"matched" as const,visitorId:id});
const deps=(v:TableClient,c:TableClient)=>{const r=runtime(v,c,cutoff);return {table:v,resolveIdentity:matched,recordConsent:r.recordConsent,recordPreAttendanceWithdrawal:r.recordPreAttendanceWithdrawal};};
async function absent(v:TableClient,submissionId:string){await assert.rejects(v.getEntity("VISITOR_CHECK_IN",submissionId),(e:unknown)=>(e as {statusCode?:number}).statusCode===404);}
async function decide(c:TableClient,requestId:string,revision:number){return repository(c).apply(id,{kind:"verified_staff_decision",decisionId:randomUUID(),pendingRequestId:requestId,expectedRevision:revision,actorId:"synthetic-staff",decision:"granted"});}
test("committed withdrawal blocks Staff before adult attendance write",()=>fixture(async(v,c)=>{
  await seed(v,c);const command=input();const d=deps(v,c);let writes=0;
  const result=await arrival(command,{...d,record:async(cmd,options)=>{writes++;await absent(v,command.submissionId);assert.equal((await guard(id))?.status,409);assert.equal((await state(c)).pending?.requestId,command.submissionId);const {recordVisitorCheckIn}=await import("../src/services/visitors/recordVisitorCheckIn");return recordVisitorCheckIn(cmd,options);}});
  assert.equal(result.status,"recorded");assert.equal(writes,1);assert.equal((await state(c)).revision,2);
}));
test("attendance outage leaves durable suppression and exact retry does not advance revision",()=>fixture(async(v,c)=>{
  await seed(v,c);const command=input();await assert.rejects(arrival(command,{...deps(v,c),record:async()=>{throw Error("synthetic attendance outage");}}));await absent(v,command.submissionId);
  const before=await state(c);assert.equal(before.pending?.requestId,command.submissionId);assert.equal((await guard(id))?.status,409);
  assert.equal((await arrival(command,deps(v,c))).status,"recorded");assert.deepEqual(await state(c),before);
}));
test("post-attendance adapter outage cannot undo earlier withdrawal",()=>fixture(async(v,c)=>{
  await seed(v,c);const command=input();await assert.rejects(arrival(command,{...deps(v,c),recordConsent:async()=>no}));assert.equal((await v.getEntity("VISITOR_CHECK_IN",command.submissionId)).visitorId,id);assert.equal((await guard(id))?.status,409);
  const before=await state(c);assert.equal((await arrival(command,deps(v,c))).status,"recorded");assert.deepEqual(await state(c),before);
}));
test("unconfirmed pre-withdrawal cannot write attendance or family",()=>fixture(async(v,c)=>{
  await seed(v,c);const command=input();let writes=0;await assert.rejects(familyArrival({...command,family},{arrival:x=>arrival(x,{...deps(v,c),recordPreAttendanceWithdrawal:async()=>no,record:async()=>{writes++;throw Error("unexpected");}}),saveFamily:async()=>{writes++;throw Error("unexpected");}}));await absent(v,command.submissionId);assert.equal(writes,0);assert.equal(permitsContactWork(await state(c)),true);
}));
test("new decline creates no permission even before receipt and replays exactly",()=>fixture(async(v,c)=>{
  const command=input();const r=runtime(v,c,cutoff);let visitorId="";
  const result=await arrival(command,{table:v,resolveIdentity:async()=>({status:"unmatched"}),recordConsent:r.recordConsent,recordPreAttendanceWithdrawal:r.recordPreAttendanceWithdrawal,record:async(cmd,options)=>{visitorId=cmd.visitorId;assert.equal((await state(c,visitorId)).effective,"declined");await absent(v,command.submissionId);const {recordVisitorCheckIn}=await import("../src/services/visitors/recordVisitorCheckIn");return recordVisitorCheckIn(cmd,options);}});
  assert.equal(result.status,"recorded");assert.equal((await state(c,visitorId)).revision,1);
}));
test("public Yes never calls pre-withdrawal or releases pending suppression",()=>fixture(async(v,c)=>{
  await seed(v,c);const command=input();assert.equal((await arrival(command,deps(v,c))).status,"recorded");let calls=0;
  assert.equal((await arrival(input(true),{...deps(v,c),recordPreAttendanceWithdrawal:async()=>{calls++;return no;}})).status,"recorded");assert.equal(calls,0);assert.equal((await state(c)).pending?.requestId,command.submissionId);assert.equal((await guard(id))?.status,409);
}));
test("old interrupted withdrawal retry cannot reapply after verified resolution",()=>fixture(async(v,c)=>{
  await seed(v,c);const command=input();await assert.rejects(arrival(command,{...deps(v,c),record:async()=>{throw Error("synthetic outage");}}));const pending=await state(c);assert.equal((await decide(c,command.submissionId,pending.revision)).status,"committed");const resolved=await state(c);
  assert.equal((await arrival(command,deps(v,c))).status,"recorded");assert.deepEqual(await state(c),resolved);assert.equal((await guard(id))?.status,503);
}));
test("new withdrawal invalidates an earlier Staff decision even before attendance",()=>fixture(async(v,c)=>{
  await seed(v,c);const first=input();await arrival(first,deps(v,c));const pending=await state(c);const second=input();await assert.rejects(arrival(second,{...deps(v,c),record:async()=>{throw Error("synthetic outage");}}));assert.equal((await decide(c,first.submissionId,pending.revision)).status,"rejected");assert.equal((await state(c)).pending?.requestId,second.submissionId);assert.equal((await guard(id))?.status,409);
}));
test("concurrent withdrawals either commit or stop before attendance; retry reconciles both",()=>fixture(async(v,c)=>{
  await seed(v,c);const commands=[input(),input()];const results=await Promise.allSettled(commands.map(x=>arrival(x,deps(v,c))));assert.ok(results.some(x=>x.status==="fulfilled"&&x.value.status==="recorded"));
  for(let i=0;i<commands.length;i++){const op=await repository(c).inspectOperation(id,commands[i].submissionId);if(op.status!=="found")await absent(v,commands[i].submissionId);assert.equal((await arrival(commands[i],deps(v,c))).status,"recorded");}
  assert.equal((await state(c)).revision,3);assert.equal((await guard(id))?.status,409);
}));
test("wrong fingerprint and mismatched canonical contact cannot establish suppression",()=>fixture(async(v,c)=>{
  await seed(v,c);const command=input();const r=runtime(v,c,cutoff);const d=deps(v,c);
  await assert.rejects(arrival(command,{...d,recordPreAttendanceWithdrawal:async e=>{assert.deepEqual(await r.recordPreAttendanceWithdrawal({...e,registrationDetailsJson:e.registrationDetailsJson.replace("Synthetic Visitor","Different Visitor")}),no);return no;}}));await absent(v,command.submissionId);
  await v.updateEntity({partitionKey:"VISITOR",rowKey:id,email:"different@example.invalid",emailLower:"different@example.invalid"},"Merge");await assert.rejects(arrival(command,d));await absent(v,command.submissionId);assert.equal(permitsContactWork(await state(c)),true);
}));
test("actual missing consent table blocks attendance and Staff permission",()=>fixture(async(v,c)=>{
  await seed(v,c);const command=input();await c.deleteTable();try{await assert.rejects(arrival(command,deps(v,c)));await absent(v,command.submissionId);assert.equal((await guard(id))?.status,503);}finally{await c.createTable();}
}));
test("disabled legacy arrival does not write consent authority",()=>fixture(async(v,c)=>{
  await seed(v,c);const before=await state(c);await environment({[authority]:undefined,[oldGuard]:undefined},async()=>{assert.equal((await arrival(input(),{table:v,resolveIdentity:matched})).status,"recorded");});assert.deepEqual(await state(c),before);
}));
test("both HTTP activation fences still deny before runtime and Staff lookup",async()=>environment({[authority]:"true",[oldGuard]:"true",FEATURE_PERMANENT_PUBLIC_VISIT:"true",FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP:"true",FEATURE_PERMANENT_VISIT_RECOVERY_RECONCILIATION:"true",FEATURE_PERMANENT_VISIT_RECOVERY_INSPECTION:"true"},async()=>{const pub:Parameters<typeof publicEndpoint>[0]={};const admin:{res?:{status:number}}={};await publicEndpoint(pub,{method:"POST"},{runtime:async()=>{throw Error("unexpected runtime");}});await recoveryEndpoint(admin,{method:"POST"},{readStaff:async()=>{throw Error("unexpected Staff lookup");}});assert.equal(pub.res?.status,503);assert.equal(admin.res?.status,503);}));

function repository(table: Parameters<typeof baseRepository>[0]) {
  return baseRepository(table, true);
}

function runtime(...args: Parameters<typeof baseRuntime>) {
  return baseRuntime(args[0], args[1], args[2], true);
}


test("real public registration reaches durable six-week Staff workflow", () =>
  fixture(async (v, c) => {
    const { submitPermanentPublicVisitRegistration } =
      await import("../src/services/visitors/submitPermanentPublicVisitRegistration");

    const { issuePermanentPublicVisitSession } =
      await import("../src/services/visitors/permanentPublicVisitSession");

    const { createPermanentVisitorQrReservationStore } =
      await import("../src/repositories/permanentVisitorQrReservationStore");

    const { createPermanentVisitRecoveryJournal } =
      await import("../src/services/visitors/permanentVisitRecoveryJournal");

    const { enrollRecordedPublicVisitor } =
      await import("../src/services/followups/enrollRecordedPublicVisitor");

    const { SixWeekFollowupEventsRepository } =
      await import("../src/repositories/sixWeekFollowupEventsRepository");

    const { projectSixWeekVisitorFollowup } =
      await import("../src/domain/followups/projectSixWeekVisitorFollowup");

    const { resolveVisitorCheckInIdentity } =
      await import("../src/services/visitors/recordReturningVisitorCheckIn");

    const { recordVisitorCheckIn } =
      await import("../src/services/visitors/recordVisitorCheckIn");

    const { getVisitorById } =
      await import("../src/functions/_shared/visitorsRepository");

    const {
      assignSixWeekFollowupOwner,
      recordSixWeekTaskOutcome
    } = await import("../src/services/followups/sixWeekVisitorFollowupCommands");

    const { readSixWeekVisitorFollowupQueue } =
      await import("../src/services/followups/readSixWeekVisitorFollowups");

    const reservations =
      createIsolatedVisitorTestTable("PermanentVisitorAdmission");

    await reservations.createTable();

    try {
      const consent = runtime(v, c, cutoff);
      const followups = new SixWeekFollowupEventsRepository(c);
      const journal = createPermanentVisitRecoveryJournal(v);
      const consentRepository = repository(c);

      const signingSecret =
        "synthetic-integrated-session-signing-secret-only";

      const claimSecret =
        "synthetic-integrated-independent-claim-secret-only";

      const context = {
        enabled: true,
        nowMs: Date.parse("2026-11-24T19:00:00Z"),
        approvedEvents: []
      };

      type LocalContact = {
        rowKey: string;
        name?: string;
        email?: string;
        emailLower?: string;
        phone?: string;
        phoneCanonical?: string;
      };

      const readLocalVisitor = (visitorId: string) =>
        getVisitorById(visitorId, {
          getTableClient: () => v,
          ensureTableExists: async () => {}
        });

      const deps = {
        enabled: true,
        context,
        signingSecret,
        claimSecret,
        capacity: 10,
        store: createPermanentVisitorQrReservationStore(reservations),
        recoveryJournal: journal,
        automaticFollowupEnabled: true,

        recordAdult: (command: Parameters<typeof arrival>[0]) =>
          arrival(command, {
            table: v,
            resolveIdentity: input =>
              resolveVisitorCheckInIdentity(input, {
                readContacts: () =>
                  v.listEntities<LocalContact>({
                    queryOptions: {
                      filter: "PartitionKey eq 'VISITOR'"
                    }
                  }),
                readVisitor: readLocalVisitor
              }),
            record: (input, options) =>
              recordVisitorCheckIn(input, {
                ...options,
                table: v,
                readVisitor: readLocalVisitor
              }),
            recordConsent: consent.recordConsent,
            recordPreAttendanceWithdrawal:
              consent.recordPreAttendanceWithdrawal
          }),

        enrollFollowup: (
          evidence: Parameters<typeof enrollRecordedPublicVisitor>[0]
        ) => enrollRecordedPublicVisitor(evidence, {
          enabled: true,
          visitors: v,
          repository: followups,
          readEnrollmentPermission: consent.readEnrollmentPermission,
          appendAuthorizedEnrollment: consent.appendAuthorizedEnrollment
        })
      };

      const token = issuePermanentPublicVisitSession(
        signingSecret, context
      );

      assert.ok(token);

      const firstRequest = {
        token,
        submissionId: randomUUID(),
        body: {
          name: "Synthetic Consenting Visitor",
          email: "consenting@example.invalid",
          phone: "2015550123",
          visitType: "first",
          churchHome: "looking",
          interests: ["prayer", "church_events"],
          invitedBy: "Synthetic Inviter",
          contactConsent: true
        }
      };

      const first = await submitPermanentPublicVisitRegistration(
        firstRequest, deps
      );

      assert.deepEqual(first, {
        accepted: true,
        status: "recorded"
      }, `Unexpected registration status: ${first.status}`);

      const receipt = await v.getEntity<{
        visitorId: string;
        serviceId: string;
        registrationDetailsJson: string;
      }>("VISITOR_CHECK_IN", firstRequest.submissionId);

      const visitorId = receipt.visitorId;

      assert.equal(receipt.serviceId, "visit-2026-11-24");
      assert.equal(
        JSON.parse(receipt.registrationDetailsJson).contactConsent,
        true
      );

      assert.ok(await readLocalVisitor(visitorId));

      assert.equal(
        (await journal.inspect(firstRequest.submissionId)).status,
        "completed"
      );

      const authorityState =
        await consentRepository.read(visitorId);

      assert.equal(authorityState.status, "ready");

      if (authorityState.status !== "ready") {
        throw Error("Consent authority unavailable");
      }

      assert.equal(authorityState.state.effective, "granted");
      assert.equal(authorityState.state.pending, null);

      const enrolled = await followups.listByVisitor(visitorId);

      assert.equal(enrolled.length, 1);
      assert.equal(enrolled[0].type, "six_week_followup.plan_started");

      const plan = projectSixWeekVisitorFollowup(enrolled);

      assert.ok(plan);
      assert.equal(plan.tasks.length, 6);
      assert.equal(plan.ownerStaffId, null);

      console.log("REAL_VISITOR_AND_ATTENDANCE_SAVED=True");
      console.log("GENERAL_VISIT_ASSOCIATION_VERIFIED=True");
      console.log("REAL_AUTOMATIC_SIX_WEEK_ENROLLMENT_VERIFIED=True");

      // Exact public retry must preserve the original plan.
      assert.deepEqual(
        await submitPermanentPublicVisitRegistration(firstRequest, deps),
        { accepted: true, status: "recorded" }
      );

      assert.deepEqual(
        await followups.listByVisitor(visitorId),
        enrolled
      );

      assert.deepEqual(
        await consentRepository.read(visitorId),
        authorityState
      );

      async function countPartition(partition: string) {
        let count = 0;

        for await (const row of v.listEntities({
          queryOptions: {
            filter: `PartitionKey eq '${partition}'`
          }
        })) {
          assert.equal(row.partitionKey, partition);
          count++;
        }

        return count;
      }

      assert.equal(await countPartition("VISITOR"), 1);
      assert.equal(await countPartition("VISITOR_CHECK_IN"), 1);

      console.log("EXACT_PUBLIC_RETRY_NO_DUPLICATES=True");

      // A separate visitor declines consent at a scheduled event.
      const scheduledContext = {
        ...context,
        approvedEvents: [{
          id: "synthetic-scheduled-event",
          date: "2026-11-24",
          name: "Synthetic Scheduled Event",
          active: true
        }]
      };

      const secondToken = issuePermanentPublicVisitSession(
        signingSecret, scheduledContext
      );

      assert.ok(secondToken);

      const secondRequest = {
        token: secondToken,
        submissionId: randomUUID(),
        body: {
          name: "Synthetic Declining Visitor",
          email: "declining@example.invalid",
          visitType: "first",
          contactConsent: false
        }
      };

      const second = await submitPermanentPublicVisitRegistration(
        secondRequest, {
          ...deps,
          context: scheduledContext
        }
      );

      assert.deepEqual(second, {
        accepted: true,
        status: "recorded"
      }, `Unexpected declined registration status: ${second.status}`);

      const secondReceipt = await v.getEntity<{
        visitorId: string;
        serviceId: string;
        registrationDetailsJson: string;
      }>("VISITOR_CHECK_IN", secondRequest.submissionId);

      assert.notEqual(secondReceipt.visitorId, visitorId);
      assert.equal(
        secondReceipt.serviceId,
        "synthetic-scheduled-event"
      );

      assert.equal(
        JSON.parse(secondReceipt.registrationDetailsJson).contactConsent,
        false
      );

      const declined = await consentRepository.read(
        secondReceipt.visitorId
      );

      assert.equal(declined.status, "ready");

      if (declined.status !== "ready") {
        throw Error("Decline authority unavailable");
      }

      assert.equal(declined.state.effective, "declined");

      assert.equal(
        (await followups.listByVisitor(secondReceipt.visitorId)).length,
        0
      );

      assert.equal(
        (await journal.inspect(secondRequest.submissionId)).status,
        "completed"
      );

      assert.equal(await countPartition("VISITOR"), 2);
      assert.equal(await countPartition("VISITOR_CHECK_IN"), 2);

      console.log("SCHEDULED_EVENT_ASSOCIATION_VERIFIED=True");
      console.log("DECLINED_VISITOR_ATTENDANCE_WITHOUT_TASKS=True");

      // The real newly registered visitor must now appear
      // in the existing Staff work queue.
      const queue = await readSixWeekVisitorFollowupQueue(
        undefined, {
          repository: followups,
          getVisitor: readLocalVisitor
        }
      );

      assert.equal(queue.count, 1);
      assert.equal(queue.items[0].visitorId, visitorId);
      assert.equal(queue.needsOwner, 1);

      const staffId = "synthetic-journey-staff";

      const readStaff = async (id: string) =>
        id === staffId ? {
          staffId: id,
          status: "active" as const,
          roleLabel: "Care Team",
          displayName: "Synthetic Staff",
          createdAt: cutoff,
          updatedAt: cutoff,
          lastEventId: "synthetic-staff-event",
          entraTenantId: null,
          entraObjectId: null,
          email: null,
          phone: null,
          ministryAreaId: null
        } : null;

      let sequence = 0;
      const commandTime = Date.now() + 1000;

      const staffDeps = {
        repository: followups,
        readActor: readStaff,
        readAssignee: readStaff,
        now: () => new Date(
          commandTime + (++sequence * 1000)
        ).toISOString()
      };

      const claimed = await assignSixWeekFollowupOwner({
        visitorId,
        actorId: staffId,
        ownerStaffId: staffId
      }, staffDeps);

      assert.equal(claimed.accepted, true);

      if (!claimed.accepted) {
        throw Error("Staff claim rejected");
      }

      assert.equal(claimed.plan.ownerStaffId, staffId);

      const completed = await recordSixWeekTaskOutcome({
        visitorId,
        actorId: staffId,
        weekNumber: 1,
        disposition: "completed",
        contactMethod: "none",
        outcome: "Synthetic administrative task completed"
      }, staffDeps);

      assert.equal(completed.accepted, true);

      if (!completed.accepted) {
        throw Error("Staff task rejected");
      }

      assert.equal(completed.plan.tasks[0].status, "completed");

      const events = await followups.listByVisitor(visitorId);

      assert.equal(events.length, 3);

      console.log("REAL_REGISTRATION_REACHES_STAFF_QUEUE=True");
      console.log("REAL_REGISTERED_VISITOR_OWNER_CLAIM=True");
      console.log("REAL_REGISTERED_VISITOR_TASK_COMPLETION=True");
      console.log("RECOVERY_COMPLETION_VERIFIED=True");

    } finally {
      await reservations.deleteTable();
    }
  })
);