import type { CanonicalStaffIdentity } from "../../domain/staff/projectStaffDirectory";
import type { MinistryAuthorizationRoleV1 } from "../../contracts/ministryAuthorizationPolicy.v1";

/**
 * Maps trusted, current canonical staff evidence to a ministry policy role.
 * The caller must establish staff identity and obtain the canonical record
 * from the backend. This function does not authenticate or authorize HTTP requests.
 *
 * System administration is intentionally excluded: it requires a separate,
 * server-trusted authorization check.
 */
export function resolveTrustedMinistryRole(
  staff: Pick<CanonicalStaffIdentity, "status" | "roleLabel"> | null | undefined
): MinistryAuthorizationRoleV1 | null {
  if (!staff || staff.status !== "active" || typeof staff.roleLabel !== "string") {
    return null;
  }

  const role = staff.roleLabel.trim().toLowerCase();

  switch (role) {
    case "pastor":
      return "pastor";
    case "ministry leader":
      return "ministry_leader";
    case "staff":
      return "staff";
    default:
      return null;
  }
}
