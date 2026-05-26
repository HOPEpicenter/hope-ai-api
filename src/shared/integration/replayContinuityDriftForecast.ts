export function forecastReplayContinuityDrift(args: {
  interruptions?: number;
  recoveries?: number;
  queuePressure?: number;
}) {
  const interruptions =
    Number(args.interruptions ?? 0);

  const recoveries =
    Number(args.recoveries ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const continuityDriftRisk =
    Math.max(
      0,
      Math.min(
        1,
        (interruptions * 0.2) -
        (recoveries * 0.05) +
        (pressure * 0.35)
      )
    );

  return {
    interruptions,
    recoveries,
    queuePressure: pressure,
    continuityDriftRisk,
    continuityDrifting:
      continuityDriftRisk >= 0.5
  };
}
