import {
  classifyReplayBackpressure
} from "./replayBackpressureClassification";

export function buildReplayLatencyEnvelope(args: {
  latencyMs?: number;
  queuePressure?: number;
}) {
  const latency =
    Number(args.latencyMs ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  return {
    latencyVersion: 1,
    deterministicLatency: true,
    latencyMs: latency,
    queuePressure: pressure,
    backpressure:
      classifyReplayBackpressure(
        pressure
      ),
    degraded:
      latency >= 5000 ||
      pressure >= 0.5
  };
}
