export function computeReplayQuorumHealth(args: {
  replicas?: number;
  aligned?: number;
}) {
  const replicas =
    Math.max(
      1,
      Number(args.replicas ?? 1)
    );

  const aligned =
    Number(args.aligned ?? 0);

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (aligned / replicas) * 100
      )
    )
  );
}
