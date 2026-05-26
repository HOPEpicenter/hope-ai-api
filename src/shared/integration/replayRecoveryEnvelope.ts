import {
  computeReplayRecoveryScore
} from "./replayRecoveryScore";

import {
  classifyReplayResilience
} from "./replayResilienceClassification";

export function buildReplayRecoveryEnvelope(args: {
  repaired?: number;
  failed?: number;
  drifted?: number;
  recoveryDepth?: number;
}) {
  const recoveryScore =
    computeReplayRecoveryScore(args);

  return {
    recoveryVersion: 1,
    deterministicRecovery: true,
    recoveryScore,
    resilienceClassification:
      classifyReplayResilience(
        recoveryScore
      ),
    repaired:
      Number(args.repaired ?? 0),
    failed:
      Number(args.failed ?? 0),
    drifted:
      Number(args.drifted ?? 0),
    recoveryDepth:
      Number(args.recoveryDepth ?? 0)
  };
}
