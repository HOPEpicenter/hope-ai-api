import assert from "node:assert/strict";
import type {
  CanonicalMinistryArea
} from "../../src/domain/ministryAreas/projectMinistryAreas";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  readMinistryAreaStaffRoster
} from "../../src/services/ministryAreas/readMinistryAreaStaffRoster";

function staff(
  overrides: Partial<CanonicalStaffIdentity> &
    Pick<CanonicalStaffIdentity, "staffId" | "displayName">
): CanonicalStaffIdentity {
  return {
    staffId: overrides.staffId,
    displayName: overrides.displayName,
    roleLabel: overrides.roleLabel ?? null,
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
    lastEventId: overrides.lastEventId ?? null,
    entraTenantId: overrides.entraTenantId ?? null,
    entraObjectId: overrides.entraObjectId ?? null,
    email: overrides.email ?? null,
    phone: overrides.phone ?? null,
    ministryAreaId: overrides.ministryAreaId ?? null
  };
}

const area: CanonicalMinistryArea = {
  ministryAreaId: "ministry-area-one",
  displayName: "Care Ministry",
  status: "active",
  createdAt: "2026-09-28T12:00:00.000Z",
  updatedAt: "2026-09-28T12:00:00.000Z",
  lastEventId: "evt-area-one"
};

const inactiveArea: CanonicalMinistryArea = {
  ...area,
  ministryAreaId: "ministry-area-inactive",
  displayName: "Historical Ministry",
  status: "inactive",
  lastEventId: "evt-area-inactive"
};

const identities: CanonicalStaffIdentity[] = [
  staff({
    staffId: "staff-z",
    displayName: "Zed Staff",
    roleLabel: "Care Team",
    status: "inactive",
    ministryAreaId: area.ministryAreaId,
    email: "zed@example.org",
    phone: "555-0101",
    entraTenantId: "11111111-1111-4111-8111-111111111111",
    entraObjectId: "22222222-2222-4222-8222-222222222222"
  }),
  staff({
    staffId: "staff-a",
    displayName: "Alpha Staff",
    roleLabel: "Pastor",
    status: "active",
    ministryAreaId: area.ministryAreaId
  }),
  staff({
    staffId: "staff-other",
    displayName: "Other Staff",
    ministryAreaId: "ministry-area-other"
  }),
  staff({
    staffId: "staff-none",
    displayName: "Unlinked Staff",
    ministryAreaId: null
  }),
  staff({
    staffId: "staff-history",
    displayName: "Historical Staff",
    status: "inactive",
    ministryAreaId: inactiveArea.ministryAreaId
  })
];

async function readAreas() {
  return [area, inactiveArea];
}

async function readStaff() {
  return identities;
}

async function run(): Promise<void> {
  const roster = await readMinistryAreaStaffRoster(
    " ministry-area-one ",
    {
      readAreas,
      readStaff
    }
  );

  assert.ok(roster);

  assert.deepEqual(roster.ministryArea, area);

  assert.deepEqual(
    roster.items.map(item => [
      item.staffId,
      item.displayName,
      item.roleLabel,
      item.status,
      item.ministryAreaId
    ]),
    [
      [
        "staff-a",
        "Alpha Staff",
        "Pastor",
        "active",
        "ministry-area-one"
      ],
      [
        "staff-z",
        "Zed Staff",
        "Care Team",
        "inactive",
        "ministry-area-one"
      ]
    ]
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      roster.items[0],
      "email"
    ),
    false
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      roster.items[0],
      "phone"
    ),
    false
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      roster.items[0],
      "entraTenantId"
    ),
    false
  );

  const historicalRoster =
    await readMinistryAreaStaffRoster(
      inactiveArea.ministryAreaId,
      {
        readAreas,
        readStaff
      }
    );

  assert.ok(historicalRoster);
  assert.equal(
    historicalRoster.ministryArea.status,
    "inactive"
  );
  assert.equal(
    historicalRoster.items.length,
    1
  );
  assert.equal(
    historicalRoster.items[0].staffId,
    "staff-history"
  );

  const missing =
    await readMinistryAreaStaffRoster(
      "ministry-area-missing",
      {
        readAreas,
        readStaff
      }
    );

  assert.equal(missing, null);

  const blank =
    await readMinistryAreaStaffRoster(
      "   ",
      {
        readAreas,
        readStaff
      }
    );

  assert.equal(blank, null);

  console.log(
    "ministryAreaStaffRoster.test.ts passed"
  );
}

void run();
