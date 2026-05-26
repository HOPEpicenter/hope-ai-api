export function computeReplayCoordinationHealth(args: {
  blocked?: number;
  synchronized?: number;
  total?: number;
}) {
  const blocked =
    Number(args.blocked ?? 0);

  const synchronized =
    Number(args.synchronized ?? 0);

  const total =
    Math.max(
      1,
      Number(args.total ?? 1)
    );

  const syncRate =
    synchronized / total;

  let score =
    Math.round(syncRate * 100);

  score -=
    Math.min(
      50,
      blocked * 10
    );

  return Math.max(
    0,
    Math.min(100, score)
  );
}
