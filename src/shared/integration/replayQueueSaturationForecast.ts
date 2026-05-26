export function forecastReplayQueueSaturation(args: {
  queuePressure?: number;
  throughput?: number;
}) {
  const pressure =
    Number(args.queuePressure ?? 0);

  const throughput =
    Number(args.throughput ?? 0);

  const saturationRisk =
    Math.round(
      (pressure * 70) +
      Math.min(30, throughput / 100)
    );

  return {
    queuePressure: pressure,
    throughput,
    saturationRisk,
    saturated:
      saturationRisk >= 75
  };
}
