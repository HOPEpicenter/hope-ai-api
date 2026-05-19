export function normalizeDisplayName(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim();

  return normalized.length > 0
    ? normalized
    : null;
}

export function resolveCanonicalDisplayName(
  visitorId: string,
  profileDisplayName: unknown,
  visitorDisplayName: unknown
): string {
  return (
    normalizeDisplayName(profileDisplayName) ??
    normalizeDisplayName(visitorDisplayName) ??
    visitorId.trim()
  );
}