export type SyntheticOperationalRecordInput = {
  visitorId?: string | null;
  email?: string | null;
  displayName?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isSyntheticOperationalRecord(input: SyntheticOperationalRecordInput): boolean {
  const visitorId = normalize(input.visitorId);
  const email = normalize(input.email);
  const displayName = normalize(input.displayName);
  const name = normalize(input.name);
  const metadata = input.metadata ?? {};

  if (metadata.dummy === true || metadata.synthetic === true || metadata.test === true) return true;

  if (email.startsWith("dummy+") && email.endsWith("@example.com")) return true;
  if (email.includes("+regression") && email.endsWith("@example.com")) return true;
  if (email.includes("+smoke") && email.endsWith("@example.com")) return true;
  if (email.includes("+test") && email.endsWith("@example.com")) return true;

  if (displayName.startsWith("dummy visitor")) return true;
  if (name.startsWith("dummy visitor")) return true;

  if (visitorId.startsWith("test-") || visitorId.startsWith("dummy-")) return true;

  return false;
}