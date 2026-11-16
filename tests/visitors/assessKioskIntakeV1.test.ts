import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessKioskIntakeV1
} from "../../src/services/visitors/assessKioskIntakeV1";

const valid = {
  name: "Synthetic Guest",
  email: "guest@example.test",
  phone: "",
  visitType: "first",
  interests: ["church_events"],
  invitedBy: "",
  contactConsent: true
};

function assess(value: unknown) {
  return assessKioskIntakeV1(value);
}

test("valid guest details never authorize submission", () => {
  const result = assess(valid);
  assert.equal(result.valid, true);
  assert.equal(result.submissionAuthorized, false);
  assert.equal(result.followupAuthorized, false);
});

test("phone-only registration is accepted", () => {
  assert.equal(assess({
    ...valid,
    email: "",
    phone: "(201) 555-0123"
  }).valid, true);
});

test("missing contact method is rejected", () => {
  assert.equal(assess({
    ...valid,
    email: "",
    phone: ""
  }).valid, false);
});

test("missing consent selection is rejected", () => {
  assert.equal(assess({
    ...valid,
    contactConsent: undefined
  }).valid, false);
});

test("consent refusal is valid but never starts follow-up", () => {
  const result = assess({
    ...valid,
    contactConsent: false
  });
  assert.equal(result.valid, true);
  assert.equal(result.followupAuthorized, false);
});

test("caller-supplied staff authority is rejected", () => {
  assert.equal(assess({
    ...valid,
    admin: true
  }).valid, false);
});

test("caller-supplied visitor identity is rejected", () => {
  assert.equal(assess({
    ...valid,
    visitorId: "some-visitor"
  }).valid, false);
});

test("caller-supplied event source is rejected", () => {
  assert.equal(assess({
    ...valid,
    source: "trusted"
  }).valid, false);
});

test("invalid email is rejected", () => {
  assert.equal(assess({
    ...valid,
    email: "not-an-email"
  }).valid, false);
});

test("invalid phone is rejected", () => {
  assert.equal(assess({
    ...valid,
    email: "",
    phone: "invalid-phone"
  }).valid, false);
});

test("unsupported interest is rejected", () => {
  assert.equal(assess({
    ...valid,
    interests: ["administrator"]
  }).valid, false);
});

test("duplicate interests are rejected", () => {
  assert.equal(assess({
    ...valid,
    interests: ["prayer", "prayer"]
  }).valid, false);
});

test("missing visitor name is rejected", () => {
  assert.equal(assess({
    ...valid,
    name: ""
  }).valid, false);
});

test("oversized name is rejected", () => {
  assert.equal(assess({
    ...valid,
    name: "X".repeat(121)
  }).valid, false);
});

test("returning visitor selection is accepted", () => {
  assert.equal(assess({
    ...valid,
    visitType: "returning"
  }).valid, true);
});

test("malformed objects are rejected", () => {
  assert.equal(assess(null).valid, false);
  assert.equal(assess([]).valid, false);
  assert.equal(assess("visitor").valid, false);
});