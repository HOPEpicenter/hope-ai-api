/**
 * HOPE Ministry OS authorization policy v1.
 *
 * Approved product contract only.
 * This module does not authorize requests or change runtime behavior.
 */

export const MINISTRY_AUTHORIZATION_POLICY_VERSION = 1 as const;

export const MINISTRY_AUTHORIZATION_ROLES = [
  "pastor",
  "ministry_leader",
  "staff",
  "system_administrator"
] as const;

export type MinistryAuthorizationRoleV1 =
  (typeof MINISTRY_AUTHORIZATION_ROLES)[number];

export const MINISTRY_AUTHORIZATION_SCOPES = [
  "congregation",
  "ministry_area",
  "assigned_work",
  "system"
] as const;

export type MinistryAuthorizationScopeV1 =
  (typeof MINISTRY_AUTHORIZATION_SCOPES)[number];

export const MINISTRY_AUTHORIZATION_ACTIONS = [
  "six_week.view",
  "six_week.assign",
  "six_week.reassign",
  "six_week.record_task",
  "care.view",
  "journey.view",
  "person.view",
  "pastoral_notes.view",
  "system.admin"
] as const;

export type MinistryAuthorizationActionV1 =
  (typeof MINISTRY_AUTHORIZATION_ACTIONS)[number];

export type MinistryAuthorizationContextV1 = {
  verifiedStaffId: string;
  role: MinistryAuthorizationRoleV1;
  active: boolean;
  ledMinistryAreaIds: readonly string[];
  assignedVisitorIds: readonly string[];
};

export type MinistryAuthorizationResourceV1 = {
  visitorId: string | null;
  responsibleMinistryAreaId: string | null;
  ownerStaffId: string | null;
  confidentiality: "standard" | "restricted";
};

export type MinistryAuthorizationRequestV1 = {
  actor: MinistryAuthorizationContextV1;
  action: MinistryAuthorizationActionV1;
  resource: MinistryAuthorizationResourceV1;
};

export type MinistryAuthorizationDecisionV1 =
  | {
      allowed: true;
      policyVersion: typeof MINISTRY_AUTHORIZATION_POLICY_VERSION;
      scope: MinistryAuthorizationScopeV1;
      reason:
        | "pastor_oversight"
        | "ministry_leadership"
        | "assigned_work"
        | "system_administration";
    }
  | {
      allowed: false;
      policyVersion: typeof MINISTRY_AUTHORIZATION_POLICY_VERSION;
      reason:
        | "unverified_actor"
        | "inactive_actor"
        | "insufficient_authority"
        | "out_of_scope"
        | "unassigned_work"
        | "restricted_information"
        | "missing_resource_scope";
    };

/**
 * Policy invariants, not a runtime authorization implementation.
 * An enforcement resolver must be introduced and tested separately.
 */
export const SIX_WEEK_ASSIGNMENT_POLICY_V1 = {
  pastorMayAssign: true,
  ministryLeaderMayAssignWithinLedArea: true,
  staffMaySelfClaim: false,
  staffMayReassign: false,
  staffVisibility: "assigned_work",
  unassignedQueueVisibility: "leadership_only"
} as const;
