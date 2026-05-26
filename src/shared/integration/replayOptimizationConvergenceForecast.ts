export function forecastReplayOptimizationConvergence(args: {
  optimizationScore?: number;
  efficiency?: number;
  queuePressure?: number;
}) {
  const optimizationScore =
    Number(args.optimizationScore ?? 0);

  const efficiency =
    Number(args.efficiency ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const convergence =
    Math.max(
      0,
      Math.min(
        1,
        (optimizationScore / 100) +
        (efficiency / 100) -
        (pressure * 0.3)
      )
    );

  return {
    optimizationScore,
    efficiency,
    queuePressure: pressure,
    optimizationConvergence:
      convergence,
    optimized:
      convergence >= 0.75
  };
}
