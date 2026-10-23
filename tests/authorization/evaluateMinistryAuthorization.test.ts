import assert from "node:assert/strict";
import {
  evaluateMinistryAuthorization
} from "../../src/services/authorization/evaluateMinistryAuthorization";
import type {
  MinistryAuthorizationRequestV1
} from "../../src/contracts/ministryAuthorizationPolicy.v1";

function request(
  overrides: {
    actor?: Partial<MinistryAuthorizationRequestV1["actor"]>;
    resource?: Partial<MinistryAuthorizationRequestV1["resource"]>;
    action?: MinistryAuthorizationRequestV1["action"];
  } = {}
): MinistryAuthorizationRequestV1 {
  return {
    actor: {
      verifiedStaffId: "synthetic-staff-1",
      role: "staff",
      active: true,
      ledMinistryAreaIds: [],
      assignedVisitorIds: ["synthetic-visitor-1"],
      ...overrides.actor
    },
    action: overrides.action ?? "person.view",
    resource: {
      visitorId: "synthetic-visitor-1",
      responsibleMinistryAreaId: "synthetic-area-1",
      ownerStaffId: "synthetic-staff-1",
      confidentiality: "standard",
      ...overrides.resource
    }
  };
}

function denied(
  input: MinistryAuthorizationRequestV1,
  reason: string
): void {
  assert.deepEqual(evaluateMinistryAuthorization(input), {
    allowed: false,
    policyVersion: 1,
    reason
  });
}

function allowed(
  input: MinistryAuthorizationRequestV1,
  scope: string,
  reason: string
): void {
  assert.deepEqual(evaluateMinistryAuthorization(input), {
    allowed: true,
    policyVersion: 1,
    scope,
    reason
  });
}

function run(): void {
  // Identity and current status.
  denied(request({ actor: { verifiedStaffId: "" } }), "unverified_actor");
  denied(request({ actor: { verifiedStaffId: "   " } }), "unverified_actor");
  denied(request({ actor: { active: false } }), "inactive_actor");

  // Valid token possession alone cannot confer administrative authority.
  denied(
    request({ actor: { role: "system_administrator" } }),
    "insufficient_authority"
  );
  denied(
    request({ action: "system.admin" }),
    "insufficient_authority"
  );

  // Unsupported role and action values fail closed.
  denied(
    request({
      actor: { role: "unknown" as never }
    }),
    "insufficient_authority"
  );
  denied(
    request({ action: "unknown.action" as never }),
    "insufficient_authority"
  );

  // Pastor oversight for standard-classification visitor records.
  for (const action of [
    "person.view",
    "journey.view",
    "care.view",
    "six_week.view",
    "pastoral_notes.view"
  ] as const) {
    allowed(
      request({
        actor: {
          role: "pastor",
          assignedVisitorIds: []
        },
        action
      }),
      "congregation",
      "pastor_oversight"
    );
  }

  // Ministry leader access within explicitly led areas.
  allowed(
    request({
      actor: {
        role: "ministry_leader",
        ledMinistryAreaIds: ["synthetic-area-1"],
        assignedVisitorIds: []
      }
    }),
    "ministry_area",
    "ministry_leadership"
  );

  denied(
    request({
      actor: {
        role: "ministry_leader",
        ledMinistryAreaIds: ["other-area"],
        assignedVisitorIds: []
      }
    }),
    "out_of_scope"
  );

  // Assigned work is a separate permitted scope.
  allowed(request(), "assigned_work", "assigned_work");

  allowed(
    request({
      actor: {
        role: "ministry_leader",
        ledMinistryAreaIds: ["other-area"],
        assignedVisitorIds: ["synthetic-visitor-1"]
      }
    }),
    "assigned_work",
    "assigned_work"
  );

  denied(
    request({
      actor: { assignedVisitorIds: [] }
    }),
    "unassigned_work"
  );

  // Pastoral notes cannot be obtained through ordinary assignment.
  denied(
    request({ action: "pastoral_notes.view" }),
    "insufficient_authority"
  );

  // Restricted classification overrides ordinary role or assignment access.
  for (const role of ["staff", "ministry_leader", "pastor"] as const) {
    denied(
      request({
        actor: {
          role,
          ledMinistryAreaIds: ["synthetic-area-1"]
        },
        resource: { confidentiality: "restricted" }
      }),
      "restricted_information"
    );
  }

  // Missing record scope cannot grant a read.
  denied(
    request({ resource: { visitorId: null } }),
    "missing_resource_scope"
  );
  denied(
    request({ resource: { visitorId: "  " } }),
    "missing_resource_scope"
  );
  denied(
    request({
      resource: { confidentiality: "unknown" as never }
    }),
    "missing_resource_scope"
  );

  // Mutations remain outside this first evaluator's authority.
  for (const action of [
    "six_week.assign",
    "six_week.reassign",
    "six_week.record_task"
  ] as const) {
    denied(
      request({ actor: { role: "pastor" }, action }),
      "insufficient_authority"
    );
  }

  // Malformed runtime inputs must fail closed.
  denied(null as never, "unverified_actor");
  denied({} as never, "unverified_actor");
  denied(
    request({ actor: { assignedVisitorIds: null as never } }),
    "unassigned_work"
  );

  // PERMANENT_SECURITY_BOUNDARY_REGRESSIONS
  // Runtime callers may be JavaScript or supply malformed external values.
  for (const input of [
    null,
    {},
    request({ actor: { role: { invalid: true } as never } }),
    request({ action: { invalid: true } as never }),
    request({ actor: { assignedVisitorIds: { invalid: true } as never } }),
    request({
      actor: {
        role: "ministry_leader",
        ledMinistryAreaIds: { invalid: true } as never,
        assignedVisitorIds: []
      }
    }),
    request({ resource: { confidentiality: { invalid: true } as never } })
  ]) {
    assert.doesNotThrow(() => {
      const decision = evaluateMinistryAuthorization(input as never);
      assert.equal(decision.allowed, false);
    });
  }

  // Trusted administrator membership is checked by a separate service.
  denied(
    request({
      actor: { role: "system_administrator" },
      action: "system.admin"
    }),
    "insufficient_authority"
  );

  // Assignment never overrides pastoral-note confidentiality.
  denied(
    request({
      actor: {
        role: "ministry_leader",
        ledMinistryAreaIds: ["synthetic-area-1"]
      },
      action: "pastoral_notes.view"
    }),
    "insufficient_authority"
  );

  // Inactive pastoral status never confers congregation access.
  denied(
    request({
      actor: {
        role: "pastor",
        active: false,
        assignedVisitorIds: []
      }
    }),
    "inactive_actor"
  );
  console.log("evaluateMinistryAuthorization.test.ts passed");
}

run();
