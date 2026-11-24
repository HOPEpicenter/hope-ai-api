import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  submitPermanentVisitorRegistration as submit,
  type PermanentRegistrationDependencies
} from "../src/services/visitors/submitPermanentVisitorRegistration";

const event = {
  id: "synthetic-sunday-service",
  date: "2026-11-29",
  name: "Synthetic Sunday Service",
  active: true
};

const submissionId =
  "11111111-1111-4111-8111-111111111111";

const body = {
  name: "Synthetic Guardian",
  contactMethod: "email",
  contact: "synthetic@example.invalid",
  eventId: event.id
};

const family = {
  guardianName: body.name,
  guardianDeclaration: true,
  children: [
    { firstName: "Synthetic", ageGroup: "6-11" }
  ]
};

const adultRequest = { submissionId, body };

const familyRequest = {
  submissionId,
  body: { ...body, family }
};

function fixture() {
  const calls: string[] = [];
  const commands: unknown[] = [];

  const deps: PermanentRegistrationDependencies = {
    enabled: true,
    familyEnabled: true,
    channel: "ipad",
    nowMs: Date.parse("2026-11-29T15:00:00Z"),
    approvedEvents: [event],
    policy: {
      enabled: true,
      ownerActivated: true,
      eventId: event.id,
      date: event.date,
      opensAtMs: Date.parse("2026-11-29T14:00:00Z"),
      closesAtMs: Date.parse("2026-11-29T18:00:00Z")
    },
    admit: async () => {
      calls.push("admission");
      return true;
    },
    recordAdult: async command => {
      calls.push("adult");
      commands.push(command);
      return { status: "recorded" };
    },
    recordFamily: async command => {
      calls.push("family");
      commands.push(command);
      return { status: "recorded" };
    }
  };

  return { deps, calls, commands };
}

test("authorized adult uses only the permanent adult writer", async () => {
  const f = fixture();

  assert.deepEqual(
    await submit(adultRequest, f.deps),
    { accepted: true, status: "recorded" }
  );

  assert.deepEqual(f.calls, ["admission", "adult"]);
  assert.deepEqual(f.commands, [{
    submissionId,
    serviceId: event.id,
    name: body.name,
    email: body.contact
  }]);
});

test("authorized QR family uses only the family coordinator", async () => {
  const f = fixture();
  f.deps.channel = "guest_qr";

  assert.deepEqual(
    await submit(familyRequest, f.deps),
    { accepted: true, status: "recorded" }
  );

  assert.deepEqual(f.calls, ["admission", "family"]);
  assert.deepEqual(f.commands, [{
    submissionId,
    serviceId: event.id,
    name: body.name,
    email: body.contact,
    family
  }]);
});

test("registration is disabled by default", async () => {
  const f = fixture();
  f.deps.enabled = undefined;

  assert.equal((await submit(adultRequest, f.deps)).accepted, false);
  assert.deepEqual(f.calls, []);
});

test("family registration requires separate enablement", async () => {
  const f = fixture();
  f.deps.familyEnabled = undefined;

  assert.equal((await submit(familyRequest, f.deps)).accepted, false);
  assert.deepEqual(f.calls, []);
});

test("unapproved event and general attendance fallback are denied", async () => {
  const f = fixture();
  f.deps.approvedEvents = [];

  assert.equal((await submit(adultRequest, f.deps)).accepted, false);
  assert.deepEqual(f.calls, []);
});

test("missing channel or admission dependency cannot authorize writes", async () => {
  const f = fixture();

  assert.equal((await submit(adultRequest, {
    ...f.deps, channel: undefined
  })).accepted, false);

  assert.equal((await submit(adultRequest, {
    ...f.deps, admit: undefined
  })).accepted, false);

  assert.deepEqual(f.calls, []);
});

test("invalid submission identity is rejected before admission", async () => {
  const f = fixture();

  assert.equal((await submit({
    ...adultRequest, submissionId: "invalid"
  }, f.deps)).accepted, false);

  assert.deepEqual(f.calls, []);
});

test("unexpected visitor fields are rejected rather than discarded", async () => {
  const f = fixture();

  for (const extra of [
    { serviceId: "forged" },
    { authorized: true },
    { contactConsent: false }
  ]) {
    assert.equal((await submit({
      submissionId,
      body: { ...body, ...extra }
    }, f.deps)).accepted, false);
  }

  assert.deepEqual(f.calls, []);
});

test("invalid family or mismatched guardian is rejected", async () => {
  const f = fixture();

  for (const invalidFamily of [
    { ...family, guardianName: "Different Guardian" },
    { ...family, guardianDeclaration: false }
  ]) {
    assert.equal((await submit({
      submissionId,
      body: { ...body, family: invalidFamily }
    }, f.deps)).accepted, false);
  }

  assert.deepEqual(f.calls, []);
});

test("denied or failed channel admission never reaches a writer", async () => {
  const f = fixture();

  assert.equal((await submit(adultRequest, {
    ...f.deps, admit: async () => false
  })).accepted, false);

  assert.equal((await submit(familyRequest, {
    ...f.deps, admit: async () => {
      throw new Error("synthetic admission failure");
    }
  })).accepted, false);

  assert.deepEqual(f.calls, []);
});

test("incomplete family registration never reports success", async () => {
  const f = fixture();

  assert.deepEqual(await submit(familyRequest, {
    ...f.deps,
    recordFamily: async () => ({
      status: "family_incomplete"
    })
  }), { accepted: false, status: "try_later" });

  assert.deepEqual(await submit(familyRequest, {
    ...f.deps,
    recordFamily: async () => ({
      status: "family_incomplete",
      reason: "submission_conflict"
    })
  }), { accepted: false, status: "submission_conflict" });
});

test("unknown or failed writer response never reports success", async () => {
  const f = fixture();

  assert.deepEqual(await submit(adultRequest, {
    ...f.deps,
    recordAdult: async () => ({
      status: "already_recorded"
    })
  }), { accepted: false, status: "try_later" });

  assert.deepEqual(await submit(adultRequest, {
    ...f.deps,
    recordAdult: async () => {
      throw new Error("synthetic storage failure");
    }
  }), { accepted: false, status: "try_later" });
});

test("missing writer is rejected before consuming admission", async () => {
  const f = fixture();

  assert.equal((await submit(adultRequest, {
    ...f.deps, recordAdult: undefined
  })).accepted, false);

  assert.equal((await submit(familyRequest, {
    ...f.deps, recordFamily: undefined
  })).accepted, false);

  assert.deepEqual(f.calls, []);
});
