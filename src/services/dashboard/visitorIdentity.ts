export type CanonicalVisitorIdentity = {
  visitorId: string;
  displayName: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export function readVisitorIdentityField(visitor: unknown, field: string): string | null {
  if (visitor === null || typeof visitor !== "object") {
    return null;
  }

  const value = (visitor as Record<string, unknown>)[field];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export function readCanonicalVisitorIdentity(
  visitorId: string,
  visitor: unknown
): CanonicalVisitorIdentity {
  const name = readVisitorIdentityField(visitor, "name");
  const displayName = readVisitorIdentityField(visitor, "displayName") ?? name;

  return {
    visitorId,
    displayName,
    name,
    email: readVisitorIdentityField(visitor, "email"),
    phone: readVisitorIdentityField(visitor, "phone")
  };
}
