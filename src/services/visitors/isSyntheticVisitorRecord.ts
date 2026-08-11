export type SyntheticVisitorRecordInput = {
  visitorId?: string | null;
  email?: string | null;
  displayName?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isSyntheticVisitorRecord(input: SyntheticVisitorRecordInput): boolean {
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
  if (email.startsWith("visitor-create-contract+") && email.endsWith("@example.com")) return true;
  if (email.startsWith("pilot.acceptance.") && email.endsWith("@example.com")) return true;
  if (email.startsWith("staging-legacy-") && email.endsWith("@example.com")) return true;
  if (email === "pemail@test.gmail.com") return true;

  if (displayName.startsWith("dummy visitor")) return true;
  if (name.startsWith("dummy visitor")) return true;

  if (visitorId.startsWith("test-") || visitorId.startsWith("dummy-")) return true;

  return false;
}