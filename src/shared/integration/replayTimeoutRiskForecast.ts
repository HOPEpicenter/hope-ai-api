export function forecastReplayTimeoutRisk(args: {
  latencyMs?: number;
  timeoutMs?: number;
  queuePressure?: number;
}) {
  const latency =
    Number(args.latencyMs ?? 0);

  const timeout =
    Math.max(
      1,
      Number(args.timeoutMs ?? 1)
    );

  const pressure =
    Number(args.queuePressure ?? 0);

  const latencyRisk =
    latency / timeout;

  const combinedRisk =
    Math.min(
      1,
      (latencyRisk * 0.7) +
      (pressure * 0.3)
    );

  return {
    latencyMs: latency,
    timeoutMs: timeout,
    queuePressure: pressure,
    timeoutRisk: combinedRisk,
    highRisk:
      combinedRisk >= 0.75
  };
}
