export type StaffStatus = "active" | "inactive";

export const STAFF_IDENTITY_REGISTRY = [
  {
    staffId: "ops-user-1",
    displayName: "Operations Team",
    roleLabel: "Operations"
  },
  {
    staffId: "ops-user-2",
    displayName: "Guest Services",
    roleLabel: "Guest Services"
  }
] as const;

const STAFF_DISPLAY_NAMES = new Map<string, string>(
  STAFF_IDENTITY_REGISTRY.map(x => [x.staffId, x.displayName])
);

export type StaffOwnerRef = {
  ownerType: "staff";
  ownerId: string;
  displayName: string;
};

export function listKnownStaffIdentities() {
  return [...STAFF_IDENTITY_REGISTRY];
}

export function normalizeStaffId(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

export function resolveStaffDisplayName(staffId: unknown): string | null {
  const normalized = normalizeStaffId(staffId);

  if (!normalized) {
    return null;
  }

  return STAFF_DISPLAY_NAMES.get(normalized)
    ?? normalized;
}

export function isKnownStaffId(staffId: unknown): boolean {
  const normalized = normalizeStaffId(staffId);

  if (!normalized) {
    return false;
  }

  return STAFF_DISPLAY_NAMES.has(normalized);
}

export function buildStaffOwnerRef(staffId: unknown): StaffOwnerRef | null {
  const normalized = normalizeStaffId(staffId);

  if (!normalized) {
    return null;
  }

  const displayName = resolveStaffDisplayName(normalized);

  if (!displayName) {
    return null;
  }

  return {
    ownerType: "staff",
    ownerId: normalized,
    displayName
  };
}

/**
 * Backwards-compatible operator exports.
 *
 * Existing care/followup code still uses operator naming. Staff Identity v1
 * keeps those imports stable while moving the underlying language toward
 * staff-owned ministry assignment.
 */
export const OPERATOR_REGISTRY = STAFF_IDENTITY_REGISTRY.map(x => ({
  operatorId: x.staffId,
  displayName: x.displayName
}));

export type OperatorOwnerRef = {
  ownerType: "user";
  ownerId: string;
};

export function listKnownOperators() {
  return [...OPERATOR_REGISTRY];
}

export const normalizeOperatorId = normalizeStaffId;
export const resolveOperatorDisplayName = resolveStaffDisplayName;
export const isKnownOperatorId = isKnownStaffId;

export function buildOperatorOwnerRef(ownerId: unknown): OperatorOwnerRef | null {
  const normalized = normalizeOperatorId(ownerId);

  if (!normalized) {
    return null;
  }

  return {
    ownerType: "user",
    ownerId: normalized
  };
}
