export type ReplaySlaClassification =
  | "healthy"
  | "warning"
  | "breached"
  | "critical";

export function classifyReplaySla(args: {
  latencyMs?: number;
  timeoutMs?: number;
}) {
  const latency =
    Number(args.latencyMs ?? 0);

  const timeout =
    Math.max(
      1,
      Number(args.timeoutMs ?? 1)
    );

  const utilization =
    latency / timeout;

  if (utilization >= 1) {
    return "critical";
  }

  if (utilization >= 0.8) {
    return "breached";
  }

  if (utilization >= 0.5) {
    return "warning";
  }

  return "healthy";
}
