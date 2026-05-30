export const OPERATOR_REGISTRY = [
  {
    operatorId: "ops-user-1",
    displayName: "Operations Team"
  },
  {
    operatorId: "ops-user-2",
    displayName: "Guest Services"
  }
] as const;

const OPERATOR_DISPLAY_NAMES = new Map<string, string>(
  OPERATOR_REGISTRY.map(x => [x.operatorId, x.displayName])
);

export type OperatorOwnerRef = {
  ownerType: "user";
  ownerId: string;
};

export function listKnownOperators() {
  return [...OPERATOR_REGISTRY];
}

export function normalizeOperatorId(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

export function resolveOperatorDisplayName(ownerId: unknown): string | null {
  const normalized = normalizeOperatorId(ownerId);

  if (!normalized) {
    return null;
  }

  return OPERATOR_DISPLAY_NAMES.get(normalized)
    ?? normalized;
}

export function isKnownOperatorId(ownerId: unknown): boolean {
  const normalized = normalizeOperatorId(ownerId);

  if (!normalized) {
    return false;
  }

  return OPERATOR_DISPLAY_NAMES.has(normalized);
}

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
