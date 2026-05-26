export function forecastReplayPolicyDrift(args: {
  violations?: number;
  overrides?: number;
  queuePressure?: number;
}) {
  const violations =
    Number(args.violations ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const driftRisk =
    Math.max(
      0,
      Math.min(
        1,
        (violations * 0.15) +
        (overrides * 0.1) +
        (pressure * 0.4)
      )
    );

  return {
    violations,
    overrides,
    queuePressure: pressure,
    driftRisk,
    policyDrifting:
      driftRisk >= 0.5
  };
}
