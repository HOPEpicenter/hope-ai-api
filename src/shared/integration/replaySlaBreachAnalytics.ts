export function buildReplaySlaBreachAnalytics(args: {
  breached?: number;
  total?: number;
}) {
  const breached =
    Number(args.breached ?? 0);

  const total =
    Number(args.total ?? 0);

  const breachRate =
    total > 0
      ? breached / total
      : 0;

  return {
    breached,
    total,
    breachRate,
    unstable:
      breachRate >= 0.2
  };
}
