export function buildReplayConsensusStateAnalytics(args: {
  replicas?: number;
  aligned?: number;
  divergent?: number;
}) {
  const replicas =
    Number(args.replicas ?? 0);

  const aligned =
    Number(args.aligned ?? 0);

  const divergent =
    Number(args.divergent ?? 0);

  const consensusRate =
    replicas > 0
      ? aligned / replicas
      : 0;

  return {
    replicas,
    aligned,
    divergent,
    consensusRate,
    converged:
      divergent === 0
  };
}
