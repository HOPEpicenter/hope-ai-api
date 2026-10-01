import type {
  CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";

export type PastoralAuthorizationStaff =
  | {
      status?: string | null;
      roleLabel?: string | null;
    }
  | null
  | undefined;

const PASTORAL_AUTHORITY_ROLES = new Set([
  "pastor",
  "ministry leader"
]);

function normalizeRoleLabel(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function isPastoralAuthority(
  staff: PastoralAuthorizationStaff
): boolean {
  if (!staff || staff.status !== "active") {
    return false;
  }

  return PASTORAL_AUTHORITY_ROLES.has(
    normalizeRoleLabel(staff.roleLabel)
  );
}

export function canBeCareOwner(
  staff: PastoralAuthorizationStaff
): boolean {
  return isPastoralAuthority(staff);
}

export function canAssignCareOwner(
  staff: PastoralAuthorizationStaff
): boolean {
  return isPastoralAuthority(staff);
}

export function canViewPastoralNotes(
  staff: PastoralAuthorizationStaff
): boolean {
  return isPastoralAuthority(staff);
}

export function canWritePastoralNotes(
  staff: PastoralAuthorizationStaff
): boolean {
  return isPastoralAuthority(staff);
}

export function canViewHighRiskAlerts(
  staff: PastoralAuthorizationStaff
): boolean {
  return isPastoralAuthority(staff);
}

export function canOverrideSixWeekPlanOwner(
  staff: PastoralAuthorizationStaff
): boolean {
  return isPastoralAuthority(staff);
}
