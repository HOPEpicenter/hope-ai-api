import {
  MINISTRY_AUTHORIZATION_ACTIONS,
  MINISTRY_AUTHORIZATION_POLICY_VERSION,
  MINISTRY_AUTHORIZATION_ROLES,
  type MinistryAuthorizationDecisionV1,
  type MinistryAuthorizationRequestV1
} from "../../contracts/ministryAuthorizationPolicy.v1";

/**
 * Pure policy evaluation of an already trusted staff context.
 *
 * This function does not authenticate a user, verify an Entra token,
 * load canonical staff data, or grant permission to execute requests.
 *
 * Callers must independently establish the actor's verified identity,
 * current status, role, assignments, and resource classification.
 *
 * No HTTP handler uses this function until separately integrated.
 */
export function evaluateMinistryAuthorization(
  request: MinistryAuthorizationRequestV1
): MinistryAuthorizationDecisionV1 {
  const deny = (
    reason: Extract<
      MinistryAuthorizationDecisionV1,
      { allowed: false }
    >["reason"]
  ): MinistryAuthorizationDecisionV1 => ({
    allowed: false,
    policyVersion: MINISTRY_AUTHORIZATION_POLICY_VERSION,
    reason
  });

  const actor = request?.actor;
  const resource = request?.resource;
  const action = request?.action;

  if (
    !actor ||
    typeof actor.verifiedStaffId !== "string" ||
    !actor.verifiedStaffId.trim()
  ) {
    return deny("unverified_actor");
  }

  if (actor.active !== true) {
    return deny("inactive_actor");
  }

  if (
    !MINISTRY_AUTHORIZATION_ROLES.includes(actor.role) ||
    !MINISTRY_AUTHORIZATION_ACTIONS.includes(action)
  ) {
    return deny("insufficient_authority");
  }

  // Mutations and administration require separate trusted authorization.
  if (
    action === "system.admin" ||
    action === "six_week.assign" ||
    action === "six_week.reassign" ||
    action === "six_week.record_task"
  ) {
    return deny("insufficient_authority");
  }

  if (
    !resource ||
    (resource.confidentiality !== "standard" &&
      resource.confidentiality !== "restricted")
  ) {
    return deny("missing_resource_scope");
  }

  // No restricted-record privilege is defined by this evaluator.
  if (resource.confidentiality === "restricted") {
    return deny("restricted_information");
  }

  const visitorId =
    typeof resource.visitorId === "string"
      ? resource.visitorId.trim()
      : "";

  // All remaining supported actions are visitor-scoped reads.
  if (!visitorId) {
    return deny("missing_resource_scope");
  }

  // Identity and policy role are distinct from trusted admin membership.
  if (actor.role === "system_administrator") {
    return deny("insufficient_authority");
  }

  if (actor.role === "pastor") {
    return {
      allowed: true,
      policyVersion: MINISTRY_AUTHORIZATION_POLICY_VERSION,
      scope: "congregation",
      reason: "pastor_oversight"
    };
  }

  if (action === "pastoral_notes.view") {
    return deny("insufficient_authority");
  }

  const areaId =
    typeof resource.responsibleMinistryAreaId === "string"
      ? resource.responsibleMinistryAreaId.trim()
      : "";

  if (actor.role === "ministry_leader") {
    const ledAreas = actor.ledMinistryAreaIds;

    if (
      areaId &&
      Array.isArray(ledAreas) &&
      ledAreas.some(
        id => typeof id === "string" && id.trim() === areaId
      )
    ) {
      return {
        allowed: true,
        policyVersion: MINISTRY_AUTHORIZATION_POLICY_VERSION,
        scope: "ministry_area",
        reason: "ministry_leadership"
      };
    }
  }

  const assignments = actor.assignedVisitorIds;

  if (
    Array.isArray(assignments) &&
    assignments.some(
      id => typeof id === "string" && id.trim() === visitorId
    )
  ) {
    return {
      allowed: true,
      policyVersion: MINISTRY_AUTHORIZATION_POLICY_VERSION,
      scope: "assigned_work",
      reason: "assigned_work"
    };
  }

  return deny(
    actor.role === "staff"
      ? "unassigned_work"
      : "out_of_scope"
  );
}
