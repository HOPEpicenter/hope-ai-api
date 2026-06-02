export const TERMINAL_FOLLOWUP_OUTCOMES = new Set([
  "connected",
  "closed"
]);

export function isTerminalFollowupOutcome(
  outcome: string | null | undefined
): boolean {
  const normalized = String(outcome ?? "")
    .trim()
    .toLowerCase();

  return TERMINAL_FOLLOWUP_OUTCOMES.has(normalized);
}
