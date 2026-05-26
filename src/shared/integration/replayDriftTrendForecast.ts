export function forecastReplayDriftTrend(args: {
  currentDriftRate?: number;
  previousDriftRate?: number;
}) {
  const current =
    Number(args.currentDriftRate ?? 0);

  const previous =
    Number(args.previousDriftRate ?? 0);

  const delta =
    current - previous;

  return {
    currentDriftRate: current,
    previousDriftRate: previous,
    driftDelta: delta,
    improving: delta < 0,
    worsening: delta > 0,
    stable: delta === 0
  };
}
