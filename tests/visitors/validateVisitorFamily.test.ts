import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateVisitorFamily
} from "../../src/services/visitors/validateVisitorFamily";

const family = {
  guardianName: "Sample Guardian",
  guardianDeclaration: true,
  children: [
    { firstName: "Sample Child", ageGroup: "6-11" }
  ]
};

test("guardian may register a child for general attendance", () => {
  const result = validateVisitorFamily(family);

  assert.equal(result.valid, true);

  if (result.valid) {
    assert.equal(result.family.children.length, 1);
    assert.equal(
      result.family.attendancePurpose,
      "general_church_attendance"
    );
    assert.equal(result.family.guardianDeclaration, true);
  }
});

test("multiple children can attend with the same guardian", () => {
  const result = validateVisitorFamily({
    ...family,
    children: [
      { firstName: "Child One", ageGroup: "3-5" },
      { firstName: "Child Two", ageGroup: "12-17" }
    ]
  });

  assert.equal(result.valid, true);

  if (result.valid) {
    assert.equal(result.family.children.length, 2);
  }
});

test("guardian declaration is mandatory", () => {
  for (const declaration of [false, undefined, "yes"]) {
    const result = validateVisitorFamily({
      ...family,
      guardianDeclaration: declaration
    });

    assert.deepEqual(result, {
      valid: false,
      error: "guardian_declaration_required"
    });
  }
});

test("birthdates, medical details and custody fields are rejected", () => {
  const attempts = [
    {
      ...family,
      children: [{
        firstName: "Child",
        ageGroup: "6-11",
        dateOfBirth: "2018-01-01"
      }]
    },
    {
      ...family,
      children: [{
        firstName: "Child",
        ageGroup: "6-11",
        medicalNotes: "private"
      }]
    },
    {
      ...family,
      pickupAuthorized: true
    },
    {
      ...family,
      children: [{
        firstName: "Child",
        ageGroup: "6-11",
        phone: "5555550100"
      }]
    }
  ];

  for (const input of attempts) {
    assert.equal(validateVisitorFamily(input).valid, false);
  }
});

test("invalid names and unsupported age groups are rejected", () => {
  const attempts = [
    { ...family, guardianName: "" },
    { ...family, guardianName: "x".repeat(121) },
    {
      ...family,
      children: [{ firstName: "", ageGroup: "6-11" }]
    },
    {
      ...family,
      children: [{ firstName: "Child", ageGroup: "18+" }]
    }
  ];

  for (const input of attempts) {
    assert.equal(validateVisitorFamily(input).valid, false);
  }
});

test("empty or excessive child lists are rejected", () => {
  assert.equal(validateVisitorFamily({
    ...family,
    children: []
  }).valid, false);

  assert.equal(validateVisitorFamily({
    ...family,
    children: Array.from({ length: 13 }, () => ({
      firstName: "Child",
      ageGroup: "6-11"
    }))
  }).valid, false);
});

test("malformed family input fails without throwing", () => {
  for (const input of [null, [], "family", 42, {}]) {
    assert.equal(validateVisitorFamily(input).valid, false);
  }
});

test("family validation returns only approved fields", () => {
  const result = validateVisitorFamily({
    guardianName: "  Sample Guardian  ",
    guardianDeclaration: true,
    children: [{
      firstName: "  Child  ",
      ageGroup: "6-11"
    }]
  });

  assert.deepEqual(result, {
    valid: true,
    family: {
      guardianName: "Sample Guardian",
      guardianDeclaration: true,
      children: [{
        firstName: "Child",
        ageGroup: "6-11"
      }],
      attendancePurpose: "general_church_attendance"
    }
  });
});