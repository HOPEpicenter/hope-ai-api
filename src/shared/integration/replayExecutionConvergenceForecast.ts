export function forecastReplayExecutionConvergence(args: {
  optimizationScore?: number;
  schedulingReliability?: number;
  queuePressure?: number;
}) {
  const optimizationScore =
    Number(args.optimizationScore ?? 0);

  const schedulingReliability =
    Number(
      args.schedulingReliability ?? 0
    );

  const pressure =
    Number(args.queuePressure ?? 0);

  const executionConvergence =
    Math.max(
      0,
      Math.min(
        1,
        (optimizationScore / 100) +
        (schedulingReliability * 0.4) -
        (pressure * 0.25)
      )
    );

  return {
    optimizationScore,
    schedulingReliability,
    queuePressure: pressure,
    executionConvergence,
    converged:
      executionConvergence >= 0.75
  };
}
