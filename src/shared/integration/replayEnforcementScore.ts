export function computeReplayEnforcementScore(args: {
  enforced?: number;
  violations?: number;
  overrides?: number;
}) {
  const enforced =
    Number(args.enforced ?? 0);

  const violations =
    Number(args.violations ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const total =
    enforced + violations + overrides;

  if (total <= 0) {
    return 100;
  }

  const score =
    Math.round(
      ((enforced - violations) / total) * 100
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
