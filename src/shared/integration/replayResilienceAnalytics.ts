export function buildReplayResilienceAnalytics(args: {
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

  const resilienceIntegrity =
    total > 0
      ? (sustained + recoveries) / total
      : 1;

  return {
    sustained,
    interruptions,
    recoveries,
    resilienceIntegrity,
    resilient:
      resilienceIntegrity >= 0.9 &&
      interruptions <= 1
  };
}
