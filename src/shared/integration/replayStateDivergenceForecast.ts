export function forecastReplayStateDivergence(args: {
  divergent?: number;
  queuePressure?: number;
  synchronizationRisk?: number;
}) {
  const divergent =
    Number(args.divergent ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const synchronizationRisk =
    Number(args.synchronizationRisk ?? 0);

  const divergenceRisk =
    Math.min(
      1,
      (divergent * 0.2) +
      (pressure * 0.4) +
      (synchronizationRisk * 0.4)
    );

  return {
    divergent,
    queuePressure: pressure,
    synchronizationRisk,
    divergenceRisk,
    unstable:
      divergenceRisk >= 0.75
  };
}
