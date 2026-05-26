import {
  computeReplayHealthScore
} from "./replayHealthScore";

import {
  classifyReplayHealth
} from "./replayHealthClassification";

export function buildProjectionIntegrityScore(args: {
  scanned?: number;
  drifted?: number;
  repaired?: number;
  failed?: number;
  lineageDepth?: number;
}) {
  const healthScore =
    computeReplayHealthScore(args);

  return {
    integrityVersion: 1,
    deterministicIntegrity: true,
    healthScore,
    healthClassification:
      classifyReplayHealth(
        healthScore
      ),
    lineageDepth:
      Number(args.lineageDepth ?? 0),
    scanned:
      Number(args.scanned ?? 0),
    drifted:
      Number(args.drifted ?? 0),
    repaired:
      Number(args.repaired ?? 0),
    failed:
      Number(args.failed ?? 0)
  };
}
