export function computeReplayHealthScore(args: {
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

  if (scanned <= 0) {
    return 100;
  }

  let score = 100;

  score -=
    Math.min(
      60,
      (drifted / scanned) * 100
    );

  score -=
    Math.min(
      30,
      (failed / scanned) * 100
    );

  score +=
    Math.min(
      10,
      repaired
    );

  return Math.max(
    0,
    Math.min(100, Math.round(score))
  );
}
