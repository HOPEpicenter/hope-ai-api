import assert from "node:assert/strict";
import type {
  StaffEvent,
  StaffEventType
} from "../../src/domain/staff/projectStaffDirectory";
import {
  classifyStaffSecurityMutation,
  type StaffSecurityMutationKind
} from "../../src/domain/staff/classifyStaffSecurityMutation";

function event(
  type: StaffEventType,
  data: StaffEvent["data"]
): StaffEvent {
  return {
    eventId: "evt-test",
    staffId: "staff-test",
    type,
    occurredAt: "2026-10-12T12:00:00.000Z",
    actorId: "staff-admin",
    data
  };
}

function expectClassification(
  value: StaffEvent,
  kind: StaffSecurityMutationKind,
  requiresCoordination: boolean
): void {
  assert.deepEqual(
    classifyStaffSecurityMutation(value),
    {
      kind,
      requiresCoordination,
      executionPermitted: false,
      retryPermitted: false
    }
  );
}

expectClassification(
  event("staff.created", {
    displayName: "Test Staff",
    status: "active"
  }),
  "identity_creation",
  true
);

expectClassification(
  event("staff.invited", {
    displayName: "Invited Staff",
    status: "pending"
  }),
  "invitation",
  true
);

expectClassification(
  event("staff.activated", {
    status: "active"
  }),
  "activation",
  true
);

expectClassification(
  event("staff.deactivated", {
    status: "inactive",
    reason: "Test deactivation"
  }),
  "deactivation",
  true
);

expectClassification(
  event("staff.updated", {
    displayName: "Updated Name",
    roleLabel: "Care Team"
  }),
  "profile_update",
  false
);

expectClassification(
  event("staff.updated", {
    email: "updated@example.org",
    phone: "555-0101",
    ministryAreaId: "ministry-area-test"
  }),
  "profile_update",
  false
);

expectClassification(
  event("staff.updated", {
    entraTenantId: "783ef4b1-7e96-4a71-80dd-06865b015da9",
    entraObjectId: "c1717a19-c719-4ed2-8b72-e013800095de"
  }),
  "binding_change",
  true
);

expectClassification(
  event("staff.updated", {
    entraTenantId: null,
    entraObjectId: null
  }),
  "binding_change",
  true
);

expectClassification(
  event("staff.updated", {
    status: "inactive"
  }),
  "status_transition",
  true
);

expectClassification(
  event("staff.updated", {
    status: "active",
    displayName: "Changed Name"
  }),
  "status_transition",
  true
);

expectClassification(
  event("staff.updated", {}),
  "unknown",
  true
);

expectClassification(
  event("staff.updated", {
    unexpectedSecurityField: "value"
  } as StaffEvent["data"]),
  "unknown",
  true
);

expectClassification(
  event("staff.deleted" as StaffEventType, {}),
  "unknown",
  true
);

expectClassification(
  {
    ...event("staff.updated", {}),
    data: null as unknown as StaffEvent["data"]
  },
  "unknown",
  true
);

expectClassification(
  {
    ...event("staff.updated", {
      displayName: "Test"
    }),
    staffId: ""
  },
  "unknown",
  true
);

expectClassification(
  {
    ...event("staff.updated", {
      displayName: "Valid"
    }),
    eventId: ""
  },
  "unknown",
  true
);

expectClassification(
  {
    ...event("staff.updated", {
      displayName: "Valid"
    }),
    actorId: ""
  },
  "unknown",
  true
);

expectClassification(
  event("staff.updated", {
    displayName: 42
  } as unknown as StaffEvent["data"]),
  "unknown",
  true
);

expectClassification(
  event("staff.updated", {
    displayName: null
  } as unknown as StaffEvent["data"]),
  "unknown",
  true
);

expectClassification(
  event("staff.updated", {
    email: ["invalid"]
  } as unknown as StaffEvent["data"]),
  "unknown",
  true
);

console.log("Staff security mutation classifier tests passed");