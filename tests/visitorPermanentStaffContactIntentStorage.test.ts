import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";
import { createPermanentVisitorConsentRepository as repo } from "../src/repositories/permanentVisitorConsentRepository";
type Port = Parameters<typeof repo>[0];
const id="synthetic-visitor", pk=`consent-v1:${id}`;
const init={kind:"new_profile",evidenceId:"initial",initialConsent:true};
const intent={operationId:"staff-intent",actorId:"synthetic-staff",expectedRevision:1,scope:"six_week",commandDigest:"a".repeat(64)};
const no=(revision:number,requestId="withdrawal")=>({kind:"public_request",expectedRevision:revision,requestId,requestedConsent:false});
const yes=(revision:number,requestId="request-grant")=>({kind:"public_request",expectedRevision:revision,requestId,requestedConsent:true});
const decision=(revision:number)=>({kind:"verified_staff_decision",expectedRevision:revision,decisionId:"resolution",pendingRequestId:"withdrawal",actorId:"synthetic-verifier",decision:"granted"});
const contactRow="contact:staff-intent";
async function fixture(run:(c:TableClient,name:string)=>Promise<void>){const name="HopeConsent148f"+randomUUID().replace(/-/g,"");const c=createIsolatedVisitorTestTable(name);await c.createTable();try{await run(c,name);}finally{await c.deleteTable();}}
async function grant(c:TableClient){assert.deepEqual(await repo(c).apply(id,init),{status:"committed",revision:1});}
function port(c:TableClient,submitTransaction:Port["submitTransaction"]):Port{return {getEntity:c.getEntity.bind(c),listEntities:c.listEntities.bind(c),submitTransaction};}
async function rows(c:TableClient){const out:string[]=[];for await(const row of c.listEntities({queryOptions:{filter:`PartitionKey eq '${pk}'`}}))out.push(row.rowKey!);return out.sort();}
const status=(value:string)=>({status:value});
test("granted revision creates atomic immutable intent without changing logical consent",()=>fixture(async c=>{await grant(c);const r=repo(c);const before=await r.read(id);const head=await c.getEntity(pk,"head");assert.deepEqual(await r.recordContactIntent(id,intent),status("recorded"));assert.deepEqual(await r.inspectContactIntent(id,intent),status("current"));assert.deepEqual(await r.read(id),before);const next=await c.getEntity(pk,"head");assert.notEqual(next.etag,head.etag);assert.equal(next.stateJson,head.stateJson);assert.equal(next.lastOperationId,head.lastOperationId);assert.deepEqual(await rows(c),[contactRow,"head","op:initial"]);const evidence=await c.getEntity(pk,contactRow);assert.equal(evidence.consentOperationId,"initial");assert.deepEqual(JSON.parse(String(evidence.intentJson)),intent);}));
test("exact replay across clients never creates another intent or updates head",()=>fixture(async(c,name)=>{await grant(c);await repo(c).recordContactIntent(id,intent);const before=await c.getEntity(pk,contactRow);const head=await c.getEntity(pk,"head");assert.deepEqual(await repo(createIsolatedVisitorTestTable(name)).recordContactIntent(id,intent),status("replayed"));assert.deepEqual(await c.getEntity(pk,contactRow),before);assert.deepEqual(await c.getEntity(pk,"head"),head);}));
test("same operation ID cannot change actor scope digest or revision",()=>fixture(async c=>{await grant(c);await repo(c).recordContactIntent(id,intent);for(const changed of [{actorId:"different"},{scope:"care"},{commandDigest:"b".repeat(64)},{expectedRevision:2}]){assert.deepEqual(await repo(c).recordContactIntent(id,{...intent,...changed}),status("conflict"));assert.deepEqual(await repo(c).inspectContactIntent(id,{...intent,...changed}),status("conflict"));}}));
test("declined and unknown authority cannot record contact intent",()=>fixture(async c=>{const r=repo(c);await r.apply(id,{...init,initialConsent:false});await r.apply("unknown",{kind:"existing_profile",evidenceId:"legacy"});for(const v of [id,"unknown"])assert.deepEqual(await r.recordContactIntent(v,intent),status("blocked"));assert.deepEqual(await rows(c),["head","op:initial"]);}));
test("pending grant or withdrawal blocks contact at exact revision",()=>fixture(async c=>{const r=repo(c);await grant(c);await r.apply(id,no(1));await r.apply("pending",{...init,initialConsent:false});await r.apply("pending",yes(1));for(const v of [id,"pending"])assert.deepEqual(await r.recordContactIntent(v,{...intent,expectedRevision:2}),status("blocked"));assert.ok(!(await rows(c)).includes(contactRow));}));
test("withdrawal invalidates previously recorded intent without deleting evidence",()=>fixture(async c=>{await grant(c);const r=repo(c);await r.recordContactIntent(id,intent);const evidence=await c.getEntity(pk,contactRow);assert.deepEqual(await r.apply(id,no(1)),{status:"committed",revision:2});assert.deepEqual(await r.inspectContactIntent(id,intent),status("stale"));assert.deepEqual(await r.recordContactIntent(id,intent),status("stale"));assert.deepEqual(await c.getEntity(pk,contactRow),evidence);}));
test("later verified grant cannot revive old intent; fresh ID and revision required",()=>fixture(async c=>{await grant(c);const r=repo(c);await r.recordContactIntent(id,intent);await r.apply(id,no(1));assert.deepEqual(await r.apply(id,decision(2)),{status:"committed",revision:3});assert.deepEqual(await r.recordContactIntent(id,intent),status("stale"));assert.deepEqual(await r.recordContactIntent(id,{...intent,expectedRevision:3}),status("conflict"));assert.deepEqual(await r.recordContactIntent(id,{...intent,expectedRevision:3,operationId:"fresh-intent"}),status("recorded"));}));
test("withdrawal winning ETag race rolls back stale intent transaction",()=>fixture(async c=>{await grant(c);const r=repo(c);let calls=0;const racing=repo(port(c,async actions=>{calls++;assert.deepEqual(await r.apply(id,no(1)),{status:"committed",revision:2});return c.submitTransaction(actions);}));assert.deepEqual(await racing.recordContactIntent(id,intent),status("stale"));assert.equal(calls,1);assert.ok(!(await rows(c)).includes(contactRow));}));
test("withdrawal after intent commit but before readback returns stale",()=>fixture(async c=>{await grant(c);const r=repo(c);const racing=repo(port(c,async actions=>{const response=await c.submitTransaction(actions);assert.deepEqual(await r.apply(id,no(1)),{status:"committed",revision:2});return response;}));assert.deepEqual(await racing.recordContactIntent(id,intent),status("stale"));assert.ok((await rows(c)).includes(contactRow));}));
test("two concurrent exact intent attempts converge to one immutable record",()=>fixture(async(c,name)=>{await grant(c);const a=repo(c),b=repo(createIsolatedVisitorTestTable(name));const outcomes=await Promise.all([a.recordContactIntent(id,intent),b.recordContactIntent(id,intent)]);assert.ok(outcomes.some(x=>x.status==="recorded"||x.status==="replayed"));assert.ok(outcomes.every(x=>["recorded","replayed","unavailable"].includes(x.status)));assert.deepEqual(await a.recordContactIntent(id,intent),status("replayed"));assert.equal((await rows(c)).filter(x=>x===contactRow).length,1);}));
test("lost transaction acknowledgement recovers exact current intent",()=>fixture(async c=>{await grant(c);const lost=repo(port(c,async actions=>{await c.submitTransaction(actions);throw Error("synthetic lost acknowledgement");}));assert.deepEqual(await lost.recordContactIntent(id,intent),status("replayed"));assert.deepEqual(await repo(c).inspectContactIntent(id,intent),status("current"));}));
test("corrupted intent evidence fails closed without replacement",()=>fixture(async c=>{await grant(c);const r=repo(c);await r.recordContactIntent(id,intent);await c.updateEntity({partitionKey:pk,rowKey:contactRow,intentJson:"{}"},"Merge");const before=await c.getEntity(pk,contactRow);assert.deepEqual(await r.inspectContactIntent(id,intent),status("unavailable"));assert.deepEqual(await r.recordContactIntent(id,intent),status("unavailable"));assert.deepEqual(await c.getEntity(pk,contactRow),before);}));
test("missing consent anchor or corrupted head cannot validate intent",()=>fixture(async c=>{await grant(c);const r=repo(c);await r.recordContactIntent(id,intent);await c.deleteEntity(pk,"op:initial");assert.deepEqual(await r.inspectContactIntent(id,intent),status("unavailable"));assert.deepEqual(await r.recordContactIntent(id,intent),status("unavailable"));}));
test("missing authority missing table and invalid inputs fail closed",()=>fixture(async c=>{const r=repo(c);assert.deepEqual(await r.recordContactIntent(id,intent),status("unavailable"));for(const invalid of [{...intent,actorId:""},{...intent,scope:"unknown"},{...intent,commandDigest:"bad"},{...intent,expectedRevision:0},{...intent,extra:true}])assert.deepEqual(await r.recordContactIntent(id,invalid),status("invalid"));assert.deepEqual(await r.recordContactIntent("bad/id",intent),status("invalid"));const missing=repo(createIsolatedVisitorTestTable("Missing"+randomUUID().replace(/-/g,"")));assert.deepEqual(await missing.recordContactIntent(id,intent),status("unavailable"));}));
test("intent evidence cannot transfer between visitor partitions",()=>fixture(async c=>{await grant(c);const r=repo(c);await r.recordContactIntent(id,intent);await r.apply("other",init);assert.deepEqual(await r.inspectContactIntent("other",intent),status("not_found"));assert.deepEqual(await r.recordContactIntent("other",intent),status("recorded"));await r.apply(id,no(1));assert.deepEqual(await r.inspectContactIntent("other",intent),status("current"));assert.deepEqual(await r.inspectContactIntent(id,intent),status("stale"));}));

test("atomic pastoral care assignment commits exact historical evidence", () =>
  fixture(async c => {
    const authority = repo(c, true);

    const visitorId = "synthetic-care-visitor";
    const declinedId = "synthetic-care-declined";
    const pendingId = "synthetic-care-pending";
    const racingId = "synthetic-care-racing";
    const recoveryId = "synthetic-care-recovery";

    const command = {
      operationId: "synthetic-care-assignment",
      actorId: "synthetic-authorized-staff",
      assigneeId: "synthetic-care-owner",
      expectedRevision: 1
    };

    for (const target of [
      visitorId, declinedId, pendingId, racingId, recoveryId
    ]) {
      assert.equal((await authority.apply(target, {
        kind: "new_profile",
        evidenceId: "synthetic-care-initial",
        initialConsent: target !== declinedId
      })).status, "committed");
    }

    assert.equal((await authority.apply(
      pendingId, no(1)
    )).status, "committed");

    for (const target of [declinedId, pendingId]) {
      const denied = await authority.appendStaffCareAssignment(
        target, {
          ...command,
          expectedRevision: target === pendingId ? 2 : 1
        }
      );

      assert.equal(denied.status, "blocked");

      assert.deepEqual(
        await authority.readCommittedCareAssignment(
          target, command.operationId
        ),
        { status: "not_found" }
      );
    }

    assert.equal((await authority.appendStaffCareAssignment(
      "synthetic-missing-care-visitor", command
    )).status, "unavailable");

    assert.equal((await authority.appendStaffCareAssignment(
      visitorId, {
        ...command,
        actorId: "system:permanent-visitor-registration"
      }
    )).status, "invalid");

    console.log("CARE_ASSIGNMENT_DENIALS_VERIFIED=True");

    const initialConsent = await authority.read(visitorId);

    const assigned = await authority.appendStaffCareAssignment(
      visitorId, command
    );

    assert.equal(assigned.status, "committed");

    if (assigned.status !== "committed") {
      throw Error("Expected committed care assignment");
    }

    assert.equal(assigned.assignment.actorId, command.actorId);
    assert.equal(assigned.assignment.assigneeId, command.assigneeId);

    assert.deepEqual(
      await authority.read(visitorId),
      initialConsent
    );

    const observed = await repo(c, true)
      .readCommittedCareAssignment(
        visitorId, command.operationId
      );

    assert.deepEqual(observed, {
      status: "found",
      assignment: assigned.assignment
    });

    const replay = await authority.appendStaffCareAssignment(
      visitorId, command
    );

    assert.deepEqual(replay, {
      status: "replayed",
      assignment: assigned.assignment
    });

    assert.equal((await authority.appendStaffCareAssignment(
      visitorId, {
        ...command,
        assigneeId: "synthetic-different-owner"
      }
    )).status, "conflict");

    console.log("EXACT_CARE_ASSIGNMENT_PERSISTED=True");
    console.log("CARE_ASSIGNMENT_REPLAY_AND_CONFLICT_VERIFIED=True");

    let raced = false;

    const racingRepository = repo(port(c, async actions => {
      assert.equal(raced, false);
      raced = true;

      assert.equal((await authority.apply(
        racingId, no(1)
      )).status, "committed");

      return c.submitTransaction(actions);
    }), true);

    const race = await racingRepository.appendStaffCareAssignment(
      racingId, command
    );

    assert.equal(raced, true);
    assert.equal(race.status, "stale");

    assert.deepEqual(
      await authority.readCommittedCareAssignment(
        racingId, command.operationId
      ),
      { status: "not_found" }
    );

    console.log("CONCURRENT_WITHDRAWAL_BLOCKS_CARE_ASSIGNMENT=True");

    const recoveryRepository = repo(port(c, async actions => {
      await c.submitTransaction(actions);
      throw Error("Synthetic response loss after commit");
    }), true);

    const recovered = await recoveryRepository.appendStaffCareAssignment(
      recoveryId, command
    );

    assert.equal(recovered.status, "replayed");

    assert.equal(
      (await authority.readCommittedCareAssignment(
        recoveryId, command.operationId
      )).status,
      "found"
    );

    console.log("LOST_ASSIGNMENT_RESPONSE_RECOVERED=True");

    assert.equal((await authority.apply(
      visitorId, no(1)
    )).status, "committed");

    const historical = await authority.readCommittedCareAssignment(
      visitorId, command.operationId
    );

    assert.deepEqual(historical, observed);

    const newAssignment = await authority.appendStaffCareAssignment(
      visitorId, {
        ...command,
        operationId: "synthetic-new-assignment",
        expectedRevision: 2
      }
    );

    assert.equal(newAssignment.status, "blocked");

    console.log("HISTORICAL_EVIDENCE_NOT_NEW_PERMISSION=True");
  })
);
