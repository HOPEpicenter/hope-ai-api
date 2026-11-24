import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  assessPermanentVisitorAdmissionEvent as assess,
  type PermanentVisitorAdmissionPolicy
} from "../src/services/visitors/assessPermanentVisitorAdmissionEvent";

const event = {
  id: "synthetic-sunday-service",
  date: "2026-11-29",
  name: "Synthetic Sunday Service",
  active: true
};

const policy: PermanentVisitorAdmissionPolicy = {
  enabled: true,
  ownerActivated: true,
  eventId: event.id,
  date: event.date,
  opensAtMs: Date.parse("2026-11-29T14:00:00Z"),
  closesAtMs: Date.parse("2026-11-29T18:00:00Z")
};

const base = {
  policy,
  selectedEventId: event.id,
  approvedEvents: [event],
  nowMs: Date.parse("2026-11-29T15:00:00Z")
};

test("approved active event inside window is admitted", () => {
  const result = assess(base);
  assert.equal(result.admitted, true);
  if (result.admitted) {
    assert.equal(result.serviceId, event.id);
    assert.equal(result.date, event.date);
  }
});

test("missing policy fails closed", () => {
  assert.equal(assess({
    ...base, policy: undefined
  }).admitted, false);
});

test("feature remains disabled by default", () => {
  assert.equal(assess({
    ...base,
    policy: { ...policy, enabled: undefined }
  }).admitted, false);
});

test("owner activation is mandatory", () => {
  assert.equal(assess({
    ...base,
    policy: { ...policy, ownerActivated: undefined }
  }).admitted, false);
});

test("wrong or missing event selection is denied", () => {
  for (const selectedEventId of [undefined, "wrong-event"]) {
    assert.equal(assess({
      ...base, selectedEventId
    }).admitted, false);
  }
});

test("general attendance fallback cannot authorize admission", () => {
  assert.equal(assess({
    ...base, approvedEvents: []
  }).admitted, false);
});

test("inactive and wrong-date events are denied", () => {
  for (const candidate of [
    { ...event, active: false },
    { ...event, date: "2026-11-30" }
  ]) {
    assert.equal(assess({
      ...base, approvedEvents: [candidate]
    }).admitted, false);
  }
});

test("duplicate approved event identity is denied", () => {
  assert.equal(assess({
    ...base, approvedEvents: [event, event]
  }).admitted, false);
});

test("event admission window is start-inclusive and end-exclusive", () => {
  assert.equal(assess({
    ...base, nowMs: policy.opensAtMs - 1
  }).admitted, false);

  assert.equal(assess({
    ...base, nowMs: policy.opensAtMs
  }).admitted, true);

  assert.equal(assess({
    ...base, nowMs: policy.closesAtMs - 1
  }).admitted, true);

  assert.equal(assess({
    ...base, nowMs: policy.closesAtMs
  }).admitted, false);
});

test("invalid server times and reversed windows are denied", () => {
  assert.equal(assess({
    ...base, nowMs: NaN
  }).admitted, false);

  assert.equal(assess({
    ...base,
    policy: {
      ...policy,
      closesAtMs: policy.opensAtMs
    }
  }).admitted, false);
});

test("window spanning different Eastern dates is denied", () => {
  assert.equal(assess({
    ...base,
    policy: {
      ...policy,
      closesAtMs: Date.parse("2026-11-30T06:00:00Z")
    }
  }).admitted, false);
});
