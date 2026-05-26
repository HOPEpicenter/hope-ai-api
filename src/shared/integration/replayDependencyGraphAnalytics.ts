export function buildReplayDependencyGraphAnalytics(args: {
  nodes?: number;
  edges?: number;
  blocked?: number;
}) {
  const nodes =
    Number(args.nodes ?? 0);

  const edges =
    Number(args.edges ?? 0);

  const blocked =
    Number(args.blocked ?? 0);

  const dependencyDensity =
    nodes > 0
      ? edges / nodes
      : 0;

  return {
    nodes,
    edges,
    blocked,
    dependencyDensity,
    coordinationBlocked:
      blocked > 0
  };
}
