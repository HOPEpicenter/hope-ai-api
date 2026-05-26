export function computeReplayTrustScore(args: {
  verified?: number;
  anomalies?: number;
  overrides?: number;
}) {
  const verified =
    Number(args.verified ?? 0);

  const anomalies =
    Number(args.anomalies ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const total =
    verified + anomalies + overrides;

  if (total <= 0) {
    return 100;
  }

  const score =
    Math.round(
      ((verified - anomalies) / total) * 100
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
