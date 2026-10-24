import assert from "node:assert/strict";
import type { CanonicalMinistryArea } from "../../src/domain/ministryAreas/projectMinistryAreas";
import { resolveTrustedMinistryLeadershipScope } from "../../src/services/authorization/resolveTrustedMinistryLeadershipScope";

const STAFF = "verified-staff-1";
const OTHER = "verified-staff-2";

function area(
  ministryAreaId: string,
  overrides: Partial<CanonicalMinistryArea> = {}
): CanonicalMinistryArea {
  return {
    ministryAreaId,
    displayName: `Synthetic ${ministryAreaId}`,
    status: "active",
    leaderStaffId: STAFF,
    leaderStaffIds: [STAFF],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastEventId: "synthetic-event-1",
    ...overrides
  };
}

function scope(
  staffId: string,
  records: readonly CanonicalMinistryArea[]
): string[] {
  return resolveTrustedMinistryLeadershipScope(staffId, records);
}

assert.deepEqual(scope(STAFF, [
  area("area-a"),
  area("area-b")
]), ["area-a", "area-b"]);

assert.deepEqual(scope(STAFF, [
  area("area-a", {
    leaderStaffId: OTHER,
    leaderStaffIds: [OTHER, STAFF]
  })
]), ["area-a"], "Secondary listed leaders must be recognized");

assert.deepEqual(scope(STAFF, [
  area("area-inactive", { status: "inactive" }),
  area("area-active")
]), ["area-active"], "Inactive areas must not grant scope");

assert.deepEqual(scope(STAFF, [
  area("area-removed", {
    leaderStaffIds: [OTHER]
  })
]), [], "Removed leaders must not retain access");

assert.deepEqual(scope(STAFF, [
  area("area-unassigned", {
    leaderStaffId: STAFF,
    leaderStaffIds: []
  })
]), [], "Legacy leaderStaffId alone must not grant scope");

assert.deepEqual(scope(OTHER, [
  area("area-a")
]), [], "Unlisted staff must not inherit leadership");

assert.deepEqual(scope("unknown-staff", [
  area("area-a")
]), [], "Unknown staff must not inherit leadership");

for (const malformed of [
  "",
  " ",
  ` ${STAFF}`,
  `${STAFF} `
]) {
  assert.deepEqual(
    scope(malformed, [area("area-a")]),
    [],
    `Malformed staff ID rejected: ${JSON.stringify(malformed)}`
  );
}

assert.deepEqual(scope(STAFF, [
  area("area-a"),
  area("area-a"),
  area("area-b")
]), ["area-b"], "Duplicate area IDs must fail closed");

assert.deepEqual(scope(STAFF, [
  area("area-conflict"),
  area("area-conflict", { leaderStaffIds: [OTHER] })
]), [], "Conflicting leadership must not grant scope");

assert.deepEqual(scope(STAFF, [
  area("area-conflict", { leaderStaffIds: [OTHER] }),
  area("area-conflict")
]), [], "Conflicting leadership must deny in either order");

assert.deepEqual(scope(STAFF, [
  area("area-conflict"),
  area("area-conflict", { status: "inactive" })
]), [], "Active and inactive duplicate records must deny");

for (const malformedId of [
  "",
  " ",
  " area-a",
  "area-a "
]) {
  assert.deepEqual(
    scope(STAFF, [area(malformedId)]),
    [],
    `Malformed area ID rejected: ${JSON.stringify(malformedId)}`
  );
}

assert.deepEqual(scope(STAFF, [
  area("area-a", {
    leaderStaffIds: [OTHER, STAFF]
  })
]), ["area-a"], "Multiple valid leaders establish scope");

for (const badRoster of [
  [STAFF, ""],
  [STAFF, " "],
  [STAFF, ` ${OTHER}`],
  [STAFF, null],
  [STAFF, 42],
  [STAFF, STAFF]
]) {
  assert.deepEqual(
    scope(STAFF, [
      area("area-invalid", {
        leaderStaffIds: badRoster as never
      })
    ]),
    [],
    "Malformed or duplicated roster membership must deny"
  );
}

assert.deepEqual(scope(STAFF, [
  area("area-a", {
    leaderStaffIds: [` ${STAFF} `]
  })
]), [], "Padded leader IDs must not grant scope");

assert.deepEqual(scope(STAFF, [
  area("area-a", {
    leaderStaffIds: []
  })
]), [], "Empty leadership roster must deny");

assert.deepEqual(
  resolveTrustedMinistryLeadershipScope(STAFF, null as never),
  [],
  "Unavailable area evidence must deny"
);

assert.deepEqual(
  resolveTrustedMinistryLeadershipScope(STAFF, {} as never),
  [],
  "Invalid area evidence must deny"
);

console.log("resolveTrustedMinistryLeadershipScope.test.ts passed");
