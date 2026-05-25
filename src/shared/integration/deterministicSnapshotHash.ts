export function buildDeterministicSnapshotHash(
  input: unknown
): string {
  const canonical =
    JSON.stringify(input ?? null);

  return Buffer
    .from(canonical)
    .toString("base64")
    .slice(0, 48);
}
