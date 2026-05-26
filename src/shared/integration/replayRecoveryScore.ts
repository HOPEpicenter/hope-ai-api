export function computeReplayRecoveryScore(args: {
  repaired?: number;
  failed?: number;
  drifted?: number;
}) {
  const repaired =
    Number(args.repaired ?? 0);

  const failed =
    Number(args.failed ?? 0);

  const drifted =
    Number(args.drifted ?? 0);

  if (drifted <= 0) {
    return 100;
  }

  const recoveryRate =
    repaired / drifted;

  let score =
    Math.round(recoveryRate * 100);

  score -=
    Math.min(
      40,
      failed * 5
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
