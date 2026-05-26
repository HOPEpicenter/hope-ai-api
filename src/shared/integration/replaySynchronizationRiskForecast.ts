export function forecastReplaySynchronizationRisk(args: {
  blocked?: number;
  queuePressure?: number;
  timeoutRisk?: number;
}) {
  const blocked =
    Number(args.blocked ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const timeoutRisk =
    Number(args.timeoutRisk ?? 0);

  const risk =
    Math.min(
      1,
      (blocked * 0.2) +
      (pressure * 0.4) +
      (timeoutRisk * 0.4)
    );

  return {
    blocked,
    queuePressure: pressure,
    timeoutRisk,
    synchronizationRisk: risk,
    unstable:
      risk >= 0.75
  };
}
