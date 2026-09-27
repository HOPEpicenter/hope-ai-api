import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import {
  canAssignCareOwner,
  canBeCareOwner,
  canViewHighRiskAlerts,
  canViewPastoralNotes,
  canWritePastoralNotes,
  isPastoralAuthority
} from "../../src/services/authorization/pastoralAuthorization";

type CapabilityExpectation = {
  label: string;
  staff: CanonicalStaffIdentity | null | undefined;
  expected: boolean;
};

function staff(
  roleLabel: string | null,
  status: "active" | "inactive" = "active"
): CanonicalStaffIdentity {
  return {
    staffId: "staff-test",
    displayName: "Test Staff",
    roleLabel,
    status,
    createdAt: "2026-09-26T00:00:00.000Z",
    updatedAt: "2026-09-26T00:00:00.000Z",
    lastEventId: "evt-test",
    entraTenantId: null,
    entraObjectId: null,
    email: null,
    phone: null
  };
}

function assertAllCapabilities(
  expectation: CapabilityExpectation
): void {
  const {
    label,
    staff: identity,
    expected
  } = expectation;

  assert.equal(
    isPastoralAuthority(identity),
    expected,
    `${label}: isPastoralAuthority`
  );

  assert.equal(
    canBeCareOwner(identity),
    expected,
    `${label}: canBeCareOwner`
  );

  assert.equal(
    canAssignCareOwner(identity),
    expected,
    `${label}: canAssignCareOwner`
  );

  assert.equal(
    canViewPastoralNotes(identity),
    expected,
    `${label}: canViewPastoralNotes`
  );

  assert.equal(
    canWritePastoralNotes(identity),
    expected,
    `${label}: canWritePastoralNotes`
  );

  assert.equal(
    canViewHighRiskAlerts(identity),
    expected,
    `${label}: canViewHighRiskAlerts`
  );
}

function run(): void {
  const cases: CapabilityExpectation[] = [
    {
      label: "active Pastor",
      staff: staff("Pastor"),
      expected: true
    },
    {
      label: "active Ministry Leader",
      staff: staff("Ministry Leader"),
      expected: true
    },
    {
      label: "active Care Team",
      staff: staff("Care Team"),
      expected: false
    },
    {
      label: "active ordinary staff",
      staff: staff("Staff"),
      expected: false
    },
    {
      label: "inactive Pastor",
      staff: staff("Pastor", "inactive"),
      expected: false
    },
    {
      label: "inactive Ministry Leader",
      staff: staff("Ministry Leader", "inactive"),
      expected: false
    },
    {
      label: "null identity",
      staff: null,
      expected: false
    },
    {
      label: "undefined identity",
      staff: undefined,
      expected: false
    },
    {
      label: "trimmed lowercase pastor",
      staff: staff(" pastor "),
      expected: true
    },
    {
      label: "uppercase Pastor",
      staff: staff("PASTOR"),
      expected: true
    },
    {
      label: "normalized Ministry Leader",
      staff: staff(" ministry leader "),
      expected: true
    },
    {
      label: "unknown role",
      staff: staff("Unknown Role"),
      expected: false
    },
    {
      label: "Youth Leader",
      staff: staff("Youth Leader"),
      expected: false
    },
    {
      label: "Administrator",
      staff: staff("Administrator"),
      expected: false
    },
    {
      label: "Volunteer",
      staff: staff("Volunteer"),
      expected: false
    },
    {
      label: "Follow-up Team",
      staff: staff("Follow-up Team"),
      expected: false
    },
    {
      label: "missing role",
      staff: staff(null),
      expected: false
    }
  ];

  for (const testCase of cases) {
    assertAllCapabilities(testCase);
  }

  console.log(
    "pastoralAuthorization.test.ts passed"
  );
}

run();
