export function computeReplayCertificationScore(args: {
  certified?: number;
  failed?: number;
  overrides?: number;
}) {
  const certified =
    Number(args.certified ?? 0);

  const failed =
    Number(args.failed ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const total =
    certified + failed + overrides;

  if (total <= 0) {
    return 100;
  }

  const score =
    Math.round(
      ((certified - failed) / total) * 100
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
