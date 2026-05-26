export function computeReplayThroughputScore(args: {
  processed?: number;
  durationSeconds?: number;
}) {
  const processed =
    Number(args.processed ?? 0);

  const duration =
    Number(args.durationSeconds ?? 0);

  if (duration <= 0) {
    return 0;
  }

  return Math.round(
    processed / duration
  );
}
