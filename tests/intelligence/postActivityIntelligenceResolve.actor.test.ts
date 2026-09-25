import assert from "node:assert/strict";
import {
  resolveActivityIntelligenceActor
} from "../../src/functions/postActivityIntelligenceResolve";

function request(staffActorId?: string): any {
  return {
    body: { actorId: "staff-admin-spoof" },
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "x-hope-staff-actor-id"
          ? staffActorId ?? null
          : null
    }
  };
}

async function run(): Promise<void> {
  const trustedActor = await resolveActivityIntelligenceActor(
    request("staff-session-1"),
    {
      resolveAdministrativeOverride: async () => ({ ok: true, actorId: null }),
      requireStaffActor: async req => {
        assert.equal(req.headers.get("x-hope-staff-actor-id"), "staff-session-1");
        return { ok: true, actorId: "staff-canonical-1" };
      }
    }
  );

  assert.deepEqual(trustedActor, {
    ok: true,
    value: { actorId: "staff-canonical-1" }
  });

  const spoofedBodyActor = await resolveActivityIntelligenceActor(
    request(),
    {
      resolveAdministrativeOverride: async () => ({ ok: true, actorId: null }),
      requireStaffActor: async req => {
        assert.equal(req.body.actorId, "staff-admin-spoof");
        assert.equal(req.headers.get("x-hope-staff-actor-id"), null);
        return {
          ok: false,
          status: 401,
          body: { ok: false, error: "Missing x-hope-staff-actor-id" }
        };
      }
    }
  );

  assert.deepEqual(spoofedBodyActor, {
    ok: false,
    status: 401,
    body: { ok: false, error: "Missing x-hope-staff-actor-id" }
  });

  console.log("postActivityIntelligenceResolve.actor.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});