export function computeReplayContinuityScore(args: {
  sustained?: number;
  interruptions?: number;
  recoveries?: number;
}) {
  const sustained =
    Number(args.sustained ?? 0);

  const interruptions =
    Number(args.interruptions ?? 0);

  const recoveries =
    Number(args.recoveries ?? 0);

  const total =
    sustained + interruptions + recoveries;

  if (total <= 0) {
    return 100;
  }

  const score =
    Math.round(
      ((sustained + recoveries) / total) * 100
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
