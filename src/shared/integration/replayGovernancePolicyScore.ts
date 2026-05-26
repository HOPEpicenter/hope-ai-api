export function computeReplayGovernancePolicyScore(args: {
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

  if (total <= 0) {
    return 100;
  }

  const score =
    Math.round(
      ((compliant - overrides) / total) * 100
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
