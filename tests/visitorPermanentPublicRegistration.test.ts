import { test } from "node:test";
import { strict as assert } from "node:assert";

import {
  preparePermanentPublicVisitRegistration as prepare
} from "../src/services/visitors/preparePermanentPublicVisitRegistration";

const submissionId =
  "11111111-1111-4111-8111-111111111111";

const context = {
  enabled: true,
  nowMs: Date.parse("2026-11-24T19:00:00Z"),
  approvedEvents: []
};

const body = {
  name: "Synthetic Visitor",
  email: "guest@example.invalid",
  phone: "+1 (201) 555-0123",
  visitType: "first",
  churchHome: "looking",
  interests: ["prayer", "church_events"],
  invitedBy: "Synthetic Inviter",
  contactConsent: false
};

test("complete public registration preserves both contacts and every profile field", () => {
  const result = prepare(
    { submissionId, body }, context
  );

  assert.equal(result.status, "ready");

  if (result.status !== "ready") {
    throw new Error("Expected ready command");
  }

  assert.equal(
    result.command.serviceId,
    "visit-2026-11-24"
  );

  assert.equal(
    result.command.email,
    body.email
  );

  assert.match(
    result.command.phone ?? "",
    /^\d{7,15}$/
  );

  assert.deepEqual(result.command.profile, {
    visitType: "first",
    churchHome: "looking",
    interests: ["church_events", "prayer"],
    invitedBy: "Synthetic Inviter",
    contactConsent: false
  });
});

test("declining follow-up permits registration without granting permission", () => {
  const result = prepare({
    submissionId,
    body: {
      name: body.name,
      email: body.email,
      visitType: "returning",
      contactConsent: false
    }
  }, context);

  assert.equal(result.status, "ready");

  if (result.status === "ready") {
    assert.deepEqual(result.command.profile, {
      visitType: "returning",
      churchHome: null,
      interests: [],
      invitedBy: null,
      contactConsent: false
    });
  }
});

test("at least one valid contact and explicit boolean consent are required", () => {
  for (const changed of [
    { email: "", phone: "" },
    { email: "invalid" },
    { phone: "not a phone" },
    { contactConsent: undefined },
    { contactConsent: "yes" },
    { visitType: undefined }
  ]) {
    assert.deepEqual(prepare({
      submissionId,
      body: { ...body, ...changed }
    }, context), { status: "invalid" });
  }

  assert.equal(prepare({
    submissionId,
    body: { ...body, email: "" }
  }, context).status, "ready");
});

test("unknown choices and browser-supplied authority are denied", () => {
  for (const changed of [
    { interests: ["unknown"] },
    { interests: ["prayer", "prayer"] },
    { churchHome: "unknown" },
    { date: "2026-11-25" },
    { visitorId: "browser-selected-id" },
    { serviceId: "browser-selected-service" },
    { eventId: "unknown-event" },
    { staffActor: "browser-supplied-actor" }
  ]) {
    assert.deepEqual(prepare({
      submissionId,
      body: { ...body, ...changed }
    }, context), { status: "invalid" });
  }
});

test("family data is preserved only with valid guardian declaration", () => {
  const family = {
    guardianName: body.name,
    guardianDeclaration: true,
    children: [
      { firstName: "Synthetic Child", ageGroup: "6-11" }
    ]
  };

  const result = prepare({
    submissionId,
    body: { ...body, family }
  }, context, true);

  assert.equal(result.status, "ready");

  if (result.status === "ready") {
    assert.ok("family" in result.command);

    if ("family" in result.command) {
      assert.deepEqual(result.command.family, family);
    }
  }

  for (const invalid of [
    { ...family, guardianDeclaration: false },
    { ...family, guardianName: "Different Guardian" }
  ]) {
    assert.deepEqual(prepare({
      submissionId,
      body: { ...body, family: invalid }
    }, context, true), { status: "invalid" });
  }

  assert.deepEqual(prepare({
    submissionId,
    body: { ...body, family }
  }, context), { status: "unavailable" });
});

test("automatic event authority and deployment disablement remain enforced", () => {
  assert.deepEqual(prepare({
    submissionId, body
  }, {
    ...context, enabled: false
  }), { status: "unavailable" });

  const events = [
    {
      id: "synthetic-one",
      date: "2026-11-24",
      name: "Event One",
      active: true
    },
    {
      id: "synthetic-two",
      date: "2026-11-24",
      name: "Event Two",
      active: true
    }
  ];

  const current = {
    ...context,
    approvedEvents: events
  };

  assert.deepEqual(prepare({
    submissionId, body
  }, current), { status: "selection_required" });

  const selected = prepare({
    submissionId,
    body: { ...body, eventId: "synthetic-two" }
  }, current);

  assert.equal(selected.status, "ready");

  if (selected.status === "ready") {
    assert.equal(
      selected.command.serviceId,
      "synthetic-two"
    );
  }
});
