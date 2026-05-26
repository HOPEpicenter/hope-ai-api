export function computeReplayAutonomousRecoveryScore(args: {
  repaired?: number;
  autonomousRepairs?: number;
  failed?: number;
}) {
  const repaired =
    Number(args.repaired ?? 0);

  const autonomous =
    Number(args.autonomousRepairs ?? 0);

  const failed =
    Number(args.failed ?? 0);

  const total =
    repaired + failed;

  if (total <= 0) {
    return 100;
  }

  const recoveryRate =
    repaired / total;

  const automationBoost =
    autonomous * 5;

  const score =
    Math.round(
      (recoveryRate * 100) +
      automationBoost
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
