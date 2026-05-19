const OPERATOR_DISPLAY_NAMES = new Map<string, string>([
  ["ops-user-1", "Operations Team"],
  ["ops-user-2", "Guest Services"]
]);

export type OperatorOwnerRef = {
  ownerType: "user";
  ownerId: string;
};

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