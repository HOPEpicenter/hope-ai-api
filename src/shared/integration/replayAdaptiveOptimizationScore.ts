export function computeReplayAdaptiveOptimizationScore(args: {
  throughput?: number;
  recoveryScore?: number;
  queuePressure?: number;
}) {
  const throughput =
    Number(args.throughput ?? 0);

  const recoveryScore =
    Number(args.recoveryScore ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const score =
    Math.round(
      (throughput * 0.4) +
      (recoveryScore * 0.5) -
      (pressure * 20)
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
