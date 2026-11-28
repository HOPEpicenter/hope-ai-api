import assert from "node:assert/strict";
import { test } from "node:test";
import {
  prepareVisitorFamilyAttendance
} from "../../src/services/visitors/prepareVisitorFamilyAttendance";
import type {
  CheckInResult
} from "../../src/services/visitors/recordVisitorCheckIn";

const submissionId = "123e4567-e89b-42d3-a456-426614174000";
const serviceId = "visit-2026-11-30";
const adultVisitorId = "synthetic-visitor";

const checkIn: CheckInResult = {
  status: "recorded",
  receipt: {
    submissionId,
    serviceId,
    visitorId: adultVisitorId,
    recordedAt: "2026-11-30T15:00:00.000Z"
  }
};

const family = {
  guardianName: "Sample Guardian",
  guardianDeclaration: true,
  children: [
    { firstName: "Child One", ageGroup: "3-5" },
    { firstName: "Child Two", ageGroup: "12-17" }
  ]
};

const input = {
  submissionId,
  serviceId,
  adultVisitorId,
  adultName: "Sample Guardian",
  family,
  checkIn
};

test("confirmed adult receipt links the family attendance", () => {
  const result = prepareVisitorFamilyAttendance(input);
  assert.equal(result.status, "prepared");

  if (result.status === "prepared") {
    assert.equal(result.attendance.adultVisitorId, adultVisitorId);
    assert.equal(result.attendance.children.length, 2);
    assert.equal(result.attendance.relationshipStatus,
      "guardian_declared_unverified");
  }
});

test("retries produce the same receipt-scoped family ID", () => {
  const first = prepareVisitorFamilyAttendance(input);
  const second = prepareVisitorFamilyAttendance(input);

  assert.equal(first.status, "prepared");
  assert.deepEqual(first, second);
});

test("unconfirmed adult check-in cannot link children", () => {
  const result = prepareVisitorFamilyAttendance({
    ...input,
    checkIn: { status: "visitor_not_found" }
  });

  assert.deepEqual(result, {
    status: "check_in_not_recorded"
  });
});

test("a different visitor ID cannot receive the family link", () => {
  const result = prepareVisitorFamilyAttendance({
    ...input,
    adultVisitorId: "different-visitor"
  });

  assert.deepEqual(result, { status: "adult_mismatch" });
});

test("a different submission or event receipt is rejected", () => {
  for (const changed of [
    { submissionId: "different-submission" },
    { serviceId: "different-event" }
  ]) {
    const result = prepareVisitorFamilyAttendance({
      ...input,
      ...changed
    });

    assert.equal(result.status, "adult_mismatch");
  }
});

test("guardian name must match the registered adult", () => {
  const result = prepareVisitorFamilyAttendance({
    ...input,
    adultName: "Another Adult"
  });

  assert.deepEqual(result, { status: "adult_mismatch" });
});

test("unapproved child fields cannot enter the family link", () => {
  const result = prepareVisitorFamilyAttendance({
    ...input,
    family: {
      ...family,
      children: [{
        firstName: "Child",
        ageGroup: "6-11",
        phone: "5555550100"
      }]
    }
  });

  assert.deepEqual(result, { status: "invalid" });
});

test("family linking creates no permanent child identity", () => {
  const result = prepareVisitorFamilyAttendance(input);

  assert.equal(result.status, "prepared");

  if (result.status === "prepared") {
    assert.equal(
      "householdId" in result.attendance,
      false
    );

    assert.equal(
      result.attendance.children.some(child =>
        "visitorId" in child ||
        "phone" in child ||
        "email" in child
      ),
      false
    );
  }
});