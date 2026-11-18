import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mapKioskIntakeToVisitor
} from "../../src/services/visitors/mapKioskIntakeToVisitor";

const valid = {
  submissionId: "12345678-1234-4234-8234-123456789abc",
  name: "Synthetic Visitor",
  email: "guest@example.test",
  phone: "",
  visitType: "first",
  contactConsent: true,
  reviewStatus: "pending" as const
};

test("valid submission maps to canonical visitor input", () => {
  const result = mapKioskIntakeToVisitor(valid);

  assert.equal(result.visitor.name, "Synthetic Visitor");
  assert.equal(result.visitor.email, "guest@example.test");
  assert.equal(result.firstVisitDate, "2026-11-22");
  assert.equal(result.requiresAuthorizedStaffReview, true);
});

test("declined contact consent does not authorize follow-up", () => {
  const result = mapKioskIntakeToVisitor({
    ...valid,
    contactConsent: false
  });

  assert.equal(result.eligibleForStaffFollowup, false);
  assert.equal(result.requiresAuthorizedStaffReview, true);
});

test("phone-only visitor can register", () => {
  const result = mapKioskIntakeToVisitor({
    ...valid,
    email: "",
    phone: "(201) 555-0123"
  });

  assert.equal(result.visitor.email, "");
  assert.equal(result.visitor.phone, "(201) 555-0123");
});

test("missing contact information is rejected", () => {
  assert.throws(() => mapKioskIntakeToVisitor({
    ...valid,
    email: "",
    phone: ""
  }));
});

test("invalid submission identifier is rejected", () => {
  assert.throws(() => mapKioskIntakeToVisitor({
    ...valid,
    submissionId: "invalid"
  }));
});

test("missing name is rejected", () => {
  assert.throws(() => mapKioskIntakeToVisitor({
    ...valid,
    name: ""
  }));
});

test("invalid email is rejected", () => {
  assert.throws(() => mapKioskIntakeToVisitor({
    ...valid,
    email: "invalid-email"
  }));
});

test("invalid phone is rejected", () => {
  assert.throws(() => mapKioskIntakeToVisitor({
    ...valid,
    email: "",
    phone: "invalid-phone"
  }));
});

test("returning visitors require visit-history review", () => {
  const result = mapKioskIntakeToVisitor({
    ...valid,
    visitType: "returning"
  });

  assert.equal(result.eventVisitDate, "2026-11-22");
  assert.equal(result.firstVisitDate, null);
  assert.equal(result.requiresVisitHistoryReview, true);
});

test("first-time visitors retain event first-visit date", () => {
  const result = mapKioskIntakeToVisitor(valid);

  assert.equal(result.firstVisitDate, "2026-11-22");
  assert.equal(result.requiresVisitHistoryReview, false);
});

test("invalid visit classification is rejected", () => {
  assert.throws(() => mapKioskIntakeToVisitor({
    ...valid,
    visitType: "unknown"
  }));
});