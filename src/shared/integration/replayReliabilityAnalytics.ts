export function buildReplayReliabilityAnalytics(args: {
  scanned?: number;
  failed?: number;
  repaired?: number;
}) {
  const scanned =
    Number(args.scanned ?? 0);

  const failed =
    Number(args.failed ?? 0);

  const repaired =
    Number(args.repaired ?? 0);

  const reliabilityRate =
    scanned > 0
      ? (scanned - failed) / scanned
      : 1;

  const repairEfficiency =
    repaired > 0
      ? repaired / Math.max(1, repaired + failed)
      : 0;

  return {
    scanned,
    failed,
    repaired,
    reliabilityRate,
    repairEfficiency,
    reliable:
      reliabilityRate >= 0.95
  };
}
