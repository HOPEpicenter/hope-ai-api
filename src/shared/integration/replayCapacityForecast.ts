export function forecastReplayCapacity(args: {
  throughput?: number;
  utilizationRate?: number;
}) {
  const throughput =
    Number(args.throughput ?? 0);

  const utilization =
    Number(args.utilizationRate ?? 0);

  const remainingCapacity =
    Math.max(
      0,
      Math.round(
        throughput * (1 - utilization)
      )
    );

  return {
    throughput,
    utilizationRate: utilization,
    remainingCapacity,
    constrained:
      utilization >= 0.9
  };
}
