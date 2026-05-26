export function forecastReplayStability(args: {
  healthScore?: number;
  recoveryScore?: number;
  reliabilityRate?: number;
}) {
  const health =
    Number(args.healthScore ?? 0);

  const recovery =
    Number(args.recoveryScore ?? 0);

  const reliability =
    Number(args.reliabilityRate ?? 0) * 100;

  const projected =
    Math.round(
      (health * 0.4) +
      (recovery * 0.3) +
      (reliability * 0.3)
    );

  return Math.max(
    0,
    Math.min(100, projected)
  );
}
