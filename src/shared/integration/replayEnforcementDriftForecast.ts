export function forecastReplayEnforcementDrift(args: {
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

  const enforcementDriftRisk =
    Math.max(
      0,
      Math.min(
        1,
        (violations * 0.2) +
        (overrides * 0.1) +
        (pressure * 0.35)
      )
    );

  return {
    violations,
    overrides,
    queuePressure: pressure,
    enforcementDriftRisk,
    enforcementDrifting:
      enforcementDriftRisk >= 0.5
  };
}
