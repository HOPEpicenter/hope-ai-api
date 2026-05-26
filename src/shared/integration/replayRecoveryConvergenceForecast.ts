export function forecastReplayRecoveryConvergence(args: {
  divergenceRisk?: number;
  recoveryScore?: number;
  queuePressure?: number;
}) {
  const divergenceRisk =
    Number(args.divergenceRisk ?? 0);

  const recoveryScore =
    Number(args.recoveryScore ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const convergenceConfidence =
    Math.max(
      0,
      Math.min(
        1,
        (recoveryScore / 100) -
        (divergenceRisk * 0.4) -
        (pressure * 0.2)
      )
    );

  return {
    divergenceRisk,
    recoveryScore,
    queuePressure: pressure,
    convergenceConfidence,
    converging:
      convergenceConfidence >= 0.7
  };
}
