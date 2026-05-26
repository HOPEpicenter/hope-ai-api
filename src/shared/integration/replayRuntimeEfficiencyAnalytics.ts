export function buildReplayRuntimeEfficiencyAnalytics(args: {
  processed?: number;
  durationSeconds?: number;
  retries?: number;
}) {
  const processed =
    Number(args.processed ?? 0);

  const duration =
    Math.max(
      1,
      Number(args.durationSeconds ?? 1)
    );

  const retries =
    Number(args.retries ?? 0);

  const efficiency =
    processed / duration;

  return {
    processed,
    durationSeconds: duration,
    retries,
    efficiency,
    efficient:
      efficiency >= 10 &&
      retries <= 3
  };
}
