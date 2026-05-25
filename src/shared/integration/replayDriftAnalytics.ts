export function buildReplayDriftAnalytics(args: {
  scanned?: number;
  drifted?: number;
  repaired?: number;
  failed?: number;
}) {
  const scanned =
    Number(args.scanned ?? 0);

  const drifted =
    Number(args.drifted ?? 0);

  const repaired =
    Number(args.repaired ?? 0);

  const failed =
    Number(args.failed ?? 0);

  const driftRate =
    scanned > 0
      ? drifted / scanned
      : 0;

  const repairRate =
    drifted > 0
      ? repaired / drifted
      : 0;

  return {
    scanned,
    drifted,
    repaired,
    failed,
    driftRate,
    repairRate,
    healthy:
      driftRate < 0.1 &&
      failed === 0
  };
}
