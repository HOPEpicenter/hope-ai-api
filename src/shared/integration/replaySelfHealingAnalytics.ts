export function buildReplaySelfHealingAnalytics(args: {
  autonomousRepairs?: number;
  manualRepairs?: number;
  failed?: number;
}) {
  const autonomous =
    Number(args.autonomousRepairs ?? 0);

  const manual =
    Number(args.manualRepairs ?? 0);

  const failed =
    Number(args.failed ?? 0);

  const total =
    autonomous + manual + failed;

  const selfHealingRate =
    total > 0
      ? autonomous / total
      : 0;

  return {
    autonomousRepairs: autonomous,
    manualRepairs: manual,
    failed,
    selfHealingRate,
    selfHealing:
      selfHealingRate >= 0.5
  };
}
