import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  requireCurrentRegistrationContactPermission as guard,
  type RegistrationConsentReader
} from "../../src/services/followups/requireCurrentRegistrationContactPermission";
import {
  recordMinistryCommunicationIntent,
  recordMinistryCommunicationPreference,
  cancelMinistryCommunication,
  recordMinistryCommunicationOutcome,
  type MinistryCommunicationCommandDependencies
} from "../../src/services/communications/ministryCommunicationCommands";
import {
  postCareCandidateAssign,
  type CareAssignConsentDependencies
} from "../../src/functions/postCareCandidateAssign";
import {
  postCareCandidateAssignBulk,
  type CareBulkAssignDependencies
} from "../../src/functions/postCareCandidateAssignBulk";

const visitorId = "synthetic-contact-visitor";
const actorId = "synthetic-staff";
const flag = "FEATURE_PERMANENT_VISITOR_CONSENT_GUARD";
const key = "synthetic-step104-staff-key";

function consent(value: Awaited<ReturnType<RegistrationConsentReader>>): RegistrationConsentReader {
  return async () => value;
}

function fail(): never {
  throw new Error("Unexpected dependency access");
}

const rejected = {
  accepted: false,
  status: 409,
  error: "Visitor declined follow-up permission"
};

test("decline denies current contact permission", async () => {
  assert.deepEqual(await guard(visitorId, consent("declined")), rejected);
});

test("unknown and failed consent reads deny", async () => {
  assert.equal((await guard(visitorId, consent("unavailable")))?.status, 503);
  assert.equal((await guard(visitorId, async () => fail()))?.status, 503);
});

test("granted and legacy evidence retain existing authorization", async () => {
  assert.equal(await guard(visitorId, consent("granted")), null);
  assert.equal(await guard(visitorId, consent("legacy_no_evidence")), null);
});

test("disabled rollout performs no new consent read", async () => {
  const previous = process.env[flag];
  try {
    delete process.env[flag];
    assert.equal(await guard(visitorId, async () => fail()), null);
  } finally {
    if (previous === undefined) delete process.env[flag];
    else process.env[flag] = previous;
  }
});

const intent = {
  visitorId, actorId, communicationId: "synthetic-communication",
  channel: "email" as const, intent: "follow_up" as const,
  context: "person_360" as const
};

function communicationDeps(
  reader: RegistrationConsentReader
): MinistryCommunicationCommandDependencies {
  return {
    readActor: async () => ({ staffId: actorId, status: "active" }),
    readRegistrationConsent: reader,
    repository: { append: async () => fail(), listByVisitor: async () => fail() }
  };
}

test("communication intent denial occurs before ledger reads or writes including replay", async () => {
  assert.deepEqual(
    await recordMinistryCommunicationIntent(intent, communicationDeps(consent("declined"))),
    rejected
  );
  const unavailable = await recordMinistryCommunicationIntent(
    intent, communicationDeps(consent("unavailable"))
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.accepted, false);
});

test("granting a channel preference cannot override registration decline", async () => {
  const input = { visitorId, actorId, channel: "email" as const, state: "granted" as const };
  assert.deepEqual(
    await recordMinistryCommunicationPreference(input, communicationDeps(consent("declined"))),
    rejected
  );
  assert.equal((await recordMinistryCommunicationPreference(
    input, communicationDeps(consent("unavailable"))
  )).status, 503);
});

test("existing staff authorization precedes registration consent", async () => {
  const result = await recordMinistryCommunicationIntent(intent, {
    ...communicationDeps(async () => fail()),
    readActor: async () => null
  });
  assert.equal(result.status, 403);
});

test("existing channel permission is still required after registration grant", async () => {
  const result = await recordMinistryCommunicationIntent(intent, {
    ...communicationDeps(consent("granted")),
    repository: { append: async () => fail(), listByVisitor: async () => [] }
  });
  assert.equal(result.status, 409);
  assert.equal(result.accepted, false);
  if (!result.accepted) assert.match(result.error, /channel/);
});

test("restrictive preferences and terminal recording do not require a registration grant", async () => {
  type Repo = NonNullable<MinistryCommunicationCommandDependencies["repository"]>;
  const events: Parameters<Repo["append"]>[0][] = [];
  const deps: MinistryCommunicationCommandDependencies = {
    ...communicationDeps(async () => fail()),
    repository: {
      append: async event => { events.push(event); return true; },
      listByVisitor: async () => [...events]
    }
  };
  const result = await recordMinistryCommunicationPreference(
    { visitorId, actorId, channel: "email", state: "denied" }, deps
  );
  assert.equal(result.accepted, true);
  assert.equal(events.length, 1);
  // Terminal operations still enforce existing record existence.
  assert.equal((await cancelMinistryCommunication(
    { visitorId, actorId, communicationId: "missing", reason: "Synthetic cancellation" }, deps
  )).status, 404);
  assert.equal((await recordMinistryCommunicationOutcome(
    { visitorId, actorId, communicationId: "missing", outcome: "not_sent" }, deps
  )).status, 404);
  assert.equal(events.length, 1);
});

function context(): any {
  return { res: undefined, log: Object.assign(() => {}, {
    error: () => {}, warn: () => {}, info: () => {}
  }) };
}

const actor = { staffId: actorId, status: "active", roleLabel: "Pastor" };
const actorAuth = async () => ({ ok: true, actor });
const assigneeAuth = async () => ({ ok: true, actor, assignee: actor });

function singleDeps(reader: RegistrationConsentReader): CareAssignConsentDependencies {
  return {
    requireActor: actorAuth as unknown as NonNullable<CareAssignConsentDependencies["requireActor"]>,
    requireAssignee: assigneeAuth as unknown as NonNullable<CareAssignConsentDependencies["requireAssignee"]>,
    getVisitor: async () => fail(),
    readRegistrationConsent: reader
  };
}

test("direct single care assignment denies declined and unavailable consent before visitor read", async () => {
  for (const [value, status] of [["declined", 409], ["unavailable", 503]] as const) {
    const ctx = context();
    await postCareCandidateAssign(ctx, {
      headers: { "x-api-key": key },
      params: { visitorId },
      body: { assignedTo: actorId }
    }, singleDeps(consent(value)));
    assert.equal(ctx.res.status, status);
    assert.equal(ctx.res.body.ok, false);
  }
});

test("mixed-consent bulk care assignment fails before any formation table access", async () => {
  const seen: string[] = [];
  const deps: CareBulkAssignDependencies = {
    requireActor: actorAuth as unknown as NonNullable<CareBulkAssignDependencies["requireActor"]>,
    requireAssignee: assigneeAuth as unknown as NonNullable<CareBulkAssignDependencies["requireAssignee"]>,
    readRegistrationConsent: async id => {
      seen.push(id);
      return id === visitorId ? "granted" : "declined";
    },
    getTable: () => fail(),
    getVisitor: async () => fail(),
    upsertProfile: async () => fail()
  };
  const ctx = context();
  await postCareCandidateAssignBulk(ctx, {
    headers: { "x-api-key": key },
    body: { assignedTo: actorId, visitorIds: [visitorId, "synthetic-declined"] }
  }, deps);
  assert.equal(ctx.res.status, 409);
  assert.deepEqual(seen, [visitorId, "synthetic-declined"]);
});

test("missing API credentials prevent the new consent reader from running", async () => {
  const ctx = context();
  await postCareCandidateAssign(ctx, {
    headers: {}, params: { visitorId }, body: { assignedTo: actorId }
  }, singleDeps(async () => fail()));
  assert.equal(ctx.res.status, 401);
});
