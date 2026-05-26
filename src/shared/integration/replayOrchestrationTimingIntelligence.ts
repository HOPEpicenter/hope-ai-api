export function buildReplayOrchestrationTimingIntelligence(args: {
  averageLatencyMs?: number;
  queuePressure?: number;
  retries?: number;
}) {
  const latency =
    Number(args.averageLatencyMs ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const retries =
    Number(args.retries ?? 0);

  const orchestrationTimingScore =
    Math.max(
      0,
      Math.min(
        100,
        100 -
        Math.round(
          (latency / 10) +
          (pressure * 30) +
          (retries * 5)
        )
      )
    );

  return {
    averageLatencyMs: latency,
    queuePressure: pressure,
    retries,
    orchestrationTimingScore,
    responsive:
      orchestrationTimingScore >= 70
  };
}
