export function buildReplayQueueDepthAnalytics(args: {
  queued?: number;
  inflight?: number;
  processed?: number;
}) {
  const queued =
    Number(args.queued ?? 0);

  const inflight =
    Number(args.inflight ?? 0);

  const processed =
    Number(args.processed ?? 0);

  const total =
    queued + inflight + processed;

  const queuePressure =
    total > 0
      ? queued / total
      : 0;

  return {
    queued,
    inflight,
    processed,
    total,
    queuePressure
  };
}
