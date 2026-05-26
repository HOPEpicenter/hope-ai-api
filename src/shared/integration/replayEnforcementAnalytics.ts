export function buildReplayEnforcementAnalytics(args: {
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

  const enforcementIntegrity =
    total > 0
      ? enforced / total
      : 1;

  return {
    enforced,
    violations,
    overrides,
    enforcementIntegrity,
    compliant:
      enforcementIntegrity >= 0.9 &&
      violations <= 1
  };
}
