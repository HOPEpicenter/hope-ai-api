import { test } from "node:test";
import { strict as assert } from "node:assert";
import { requireRegistrationEventContactPermission as guard } from "../../src/services/followups/requireRegistrationEventContactPermission";
import type { RegistrationConsentReader } from "../../src/services/followups/requireCurrentRegistrationContactPermission";
import { postFormationEvent, type FormationEventConsentDependencies } from "../../src/functions/postFormationEvent";
import { postEngagementEvent, type EngagementEventConsentDependencies } from "../../src/functions/postEngagementEvent";
import { startSixWeekVisitorFollowup } from "../../src/services/followups/sixWeekVisitorFollowupCommands";

const visitorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorId = "synthetic-staff";
const key = "synthetic-step105-staff-key";
const flag = "FEATURE_PERMANENT_VISITOR_CONSENT_GUARD";
const fail = (): never => { throw new Error("unexpected dependency access"); };
const authorize: NonNullable<FormationEventConsentDependencies["authorizeActor"]> = async () => ({ ok: true, actorId });
const read = (value: Awaited<ReturnType<RegistrationConsentReader>>): RegistrationConsentReader => async () => value;
function context(): any {
  return { res: undefined, log: Object.assign(() => {}, { error: () => {}, warn: () => {}, info: () => {} }) };
}
function request(type: string, data: Record<string, unknown> = {}, headers: Record<string,string> = { "x-api-key": key, "x-hope-staff-actor-id": actorId }): any {
  return { headers, body: { v: 1, eventId: "evt-" + "a".repeat(32), visitorId, type, occurredAt: "2026-11-24T00:00:00.000Z", source: { system: "hope-dashboard-next", actorId }, data } };
}
const newWork = ["FOLLOWUP_ASSIGNED", "FOLLOWUP_CONTACTED", "NEXT_STEP_SELECTED", "FOLLOWUP_OUTCOME_RECORDED"];
const closure = ["FOLLOWUP_UNASSIGNED", "NEXT_STEP_COMPLETED", "SERVICE_ATTENDED", "PRAYER_REQUESTED"];

test("new contact event types require current permission", async () => {
  for (const type of newWork) assert.equal((await guard(visitorId, type, {}, read("declined")))?.status, 409);
  assert.equal((await guard(visitorId, " FOLLOWUP_ASSIGNED ", {}, read("unavailable")))?.status, 503);
});
test("terminal care outcomes without next contact and historical attendance retain existing authorization", async () => {
  for (const type of closure) assert.equal(await guard(visitorId, type, {}, async () => fail()), null);
  for (const outcome of ["connected", "closed"]) assert.equal(await guard(visitorId, "FOLLOWUP_OUTCOME_RECORDED", { outcome, nextAction: "none" }, async () => fail()), null);
  assert.equal((await guard(visitorId, "FOLLOWUP_OUTCOME_RECORDED", { outcome: "closed", nextAction: "call_again" }, read("declined")))?.status, 409);
});
test("formation route denies all new work before table or event writes", async () => {
  for (const type of newWork) for (const [value,status] of [["declined",409],["unavailable",503]] as const) {
    const ctx = context();
    await postFormationEvent(ctx, request(type), { authorizeActor: authorize, readRegistrationConsent: read(value), ensureTables: async () => fail(), recordFormation: async () => fail() });
    assert.equal(ctx.res.status,status); assert.equal(ctx.res.body.ok,false);
  }
});
test("engagement route denies all new work before either append", async () => {
  for (const type of newWork) for (const [value,status] of [["declined",409],["unavailable",503]] as const) {
    const ctx = context();
    await postEngagementEvent(ctx, request(type), { authorizeActor: authorize, readRegistrationConsent: read(value), appendEngagement: async () => fail(), recordFormation: async () => fail() });
    assert.equal(ctx.res.status,status); assert.equal(ctx.res.body.ok,false);
  }
});
test("missing API key and rejected staff actor precede consent reads on both routes", async () => {
  const blockedActor: typeof authorize = async () => ({ ok: false, status: 403, body: { ok: false } });
  for (const handle of [postFormationEvent, postEngagementEvent]) {
    let ctx = context();
    await handle(ctx, request("FOLLOWUP_ASSIGNED", {}, {}), { authorizeActor: async () => fail(), readRegistrationConsent: async () => fail(), recordFormation: async () => fail() });
    assert.equal(ctx.res.status,401);
    ctx = context();
    await handle(ctx, request("FOLLOWUP_ASSIGNED"), { authorizeActor: blockedActor, readRegistrationConsent: async () => fail(), recordFormation: async () => fail() });
    assert.equal(ctx.res.status,403);
  }
});
test("granted legacy and disabled rollout retain event policy compatibility", async () => {
  assert.equal(await guard(visitorId,"FOLLOWUP_ASSIGNED",{},read("granted")),null);
  assert.equal(await guard(visitorId,"FOLLOWUP_ASSIGNED",{},read("legacy_no_evidence")),null);
  const previous = process.env[flag];
  try { delete process.env[flag]; assert.equal(await guard(visitorId,"FOLLOWUP_ASSIGNED",{},async()=>fail()),null); }
  finally { if(previous===undefined) delete process.env[flag]; else process.env[flag]=previous; }
});
test("direct six week start service denies decline or unknown before append", async () => {
  for (const [value,status] of [["declined",409],["unavailable",503]] as const) {
    const result = await startSixWeekVisitorFollowup({ visitorId, actorId, firstVisitDate: "2026-11-24", contactConsent: true }, {
      visitorExists: async () => true,
      readActor: async () => ({ staffId: actorId, status: "active" }),
      readRegistrationConsent: read(value),
      repository: { append: async () => fail(), listByVisitor: async () => fail() }
    });
    assert.equal(result.accepted,false); assert.equal(result.status,status);
  }
});
test("direct six week start retains staff authority before consent", async () => {
  const result = await startSixWeekVisitorFollowup({ visitorId, actorId, firstVisitDate: "2026-11-24", contactConsent: true }, {
    visitorExists: async () => true, readActor: async () => null, readRegistrationConsent: async () => fail(),
    repository: { append: async () => fail(), listByVisitor: async () => fail() }
  });
  assert.equal(result.accepted,false); assert.equal(result.status,400);
});
