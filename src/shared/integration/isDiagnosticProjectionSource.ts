/**
 * Canonical diagnostic projection classification.
 *
 * Used to identify projection state derived from:
 * - regression tooling
 * - assertion pipelines
 * - operational diagnostics
 * - synthetic/runtime validation flows
 *
 * This classification supports operational truth governance
 * and canonical projection integrity semantics.
 */
export function isDiagnosticProjectionSource(
  sourceSystem: string | null
): boolean {
  const normalizedSourceSystem =
    sourceSystem?.toLowerCase() ?? "";

  return (
    normalizedSourceSystem.startsWith("scripts/") ||
    normalizedSourceSystem.includes("assert")
  );
}