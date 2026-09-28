import assert from "node:assert/strict";
import type {
  CanonicalMinistryArea
} from "../../src/domain/ministryAreas/projectMinistryAreas";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  readMinistryAreaOverview
} from "../../src/services/ministryAreas/readMinistryAreaOverview";
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
  leaderStaffId: "staff-leader",
  createdAt: "2026-09-28T12:00:00.000Z",
  updatedAt: "2026-09-28T12:00:00.000Z",
  lastEventId: "evt-area-one"
};

const inactiveArea: CanonicalMinistryArea = {
  ...area,
  ministryAreaId: "ministry-area-inactive",
  displayName: "Historical Ministry",
  status: "inactive",
  leaderStaffId: "staff-former-leader",
  lastEventId: "evt-area-inactive"
};

const areas = [area, inactiveArea];
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
    staffId: "staff-pending",
    displayName: "Middle Staff",
    status: "pending",
    ministryAreaId: area.ministryAreaId
  }),
  staff({
    staffId: "staff-a",
    displayName: "Alpha Staff",
    roleLabel: "Pastor",
    status: "active",
    ministryAreaId: area.ministryAreaId
  }),
  staff({
    staffId: "staff-leader",
    displayName: "Area Leader",
    roleLabel: "Director",
    status: "active",
    ministryAreaId: "ministry-area-other",
    email: "leader@example.org",
    phone: "555-0102",
    entraTenantId: "33333333-3333-4333-8333-333333333333",
    entraObjectId: "44444444-4444-4444-8444-444444444444"
  }),
  staff({
    staffId: "staff-former-leader",
    displayName: "Former Leader",
    status: "inactive",
    ministryAreaId: null
  }),
  staff({
    staffId: "staff-history",
    displayName: "Historical Staff",
    status: "inactive",
    ministryAreaId: inactiveArea.ministryAreaId
  })
];

async function readOverview(ministryAreaId: string) {
  return readMinistryAreaOverview(ministryAreaId, {
    readRoster: id => readMinistryAreaStaffRoster(id, {
      readAreas: async () => areas,
      readStaff: async () => identities
    }),
    readStaff: async () => identities
  });
}

async function run(): Promise<void> {
  const overview = await readOverview("ministry-area-one");

  assert.ok(overview);
  assert.deepEqual(overview.ministryArea, area);
  assert.deepEqual(overview.leader, {
    staffId: "staff-leader",
    displayName: "Area Leader",
    roleLabel: "Director",
    status: "active"
  });
  assert.deepEqual(overview.staffSummary, {
    total: 3,
    active: 1,
    pending: 1,
    inactive: 1
  });
  assert.deepEqual(
    overview.roster.map(item => item.staffId),
    ["staff-a", "staff-pending", "staff-z"]
  );

  const inactiveOverview =
    await readOverview(inactiveArea.ministryAreaId);

  assert.ok(inactiveOverview);
  assert.equal(inactiveOverview.ministryArea.status, "inactive");
  assert.deepEqual(inactiveOverview.leader, {
    staffId: "staff-former-leader",
    displayName: "Former Leader",
    roleLabel: null,
    status: "inactive"
  });

  const noLeader = await readMinistryAreaOverview(
    area.ministryAreaId,
    {
      readRoster: async () => ({
        ministryArea: { ...area, leaderStaffId: null },
        items: []
      }),
      readStaff: async () => {
        throw new Error("Staff directory should not be read without a leader");
      }
    }
  );
  assert.ok(noLeader);
  assert.equal(noLeader.leader, null);

  const unresolvedHistoricalLeader =
    await readMinistryAreaOverview(area.ministryAreaId, {
      readRoster: async () => ({
        ministryArea: { ...area, leaderStaffId: "staff-removed" },
        items: []
      }),
      readStaff: async () => identities
    });
  assert.ok(unresolvedHistoricalLeader);
  assert.equal(
    unresolvedHistoricalLeader.ministryArea.leaderStaffId,
    "staff-removed"
  );
  assert.equal(unresolvedHistoricalLeader.leader, null);

  assert.equal(
    await readOverview("ministry-area-missing"),
    null
  );
  assert.equal(await readOverview("   "), null);

  for (const item of overview.roster) {
    assert.deepEqual(Object.keys(item).sort(), [
      "displayName",
      "ministryAreaId",
      "roleLabel",
      "staffId",
      "status"
    ]);
  }
  assert.deepEqual(Object.keys(overview.leader ?? {}).sort(), [
    "displayName",
    "roleLabel",
    "staffId",
    "status"
  ]);

  console.log("ministryAreaOverview.test.ts passed");
}

void run();