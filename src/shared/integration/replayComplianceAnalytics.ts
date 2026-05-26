export function buildReplayComplianceAnalytics(args: {
  compliant?: number;
  violations?: number;
  overrides?: number;
}) {
  const compliant =
    Number(args.compliant ?? 0);

  const violations =
    Number(args.violations ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const total =
    compliant + violations + overrides;

  const complianceRate =
    total > 0
      ? compliant / total
      : 1;

  return {
    compliant,
    violations,
    overrides,
    complianceRate,
    governanceHealthy:
      complianceRate >= 0.85 &&
      violations <= 2
  };
}
