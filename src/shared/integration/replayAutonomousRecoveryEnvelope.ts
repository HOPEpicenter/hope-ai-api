import {
  computeReplayAutonomousRecoveryScore
} from "./replayAutonomousRecoveryScore";

import {
  buildReplaySelfHealingAnalytics
} from "./replaySelfHealingAnalytics";

import {
  forecastReplayRecoveryConvergence
} from "./replayRecoveryConvergenceForecast";

export function buildReplayAutonomousRecoveryEnvelope(args: {
  repaired?: number;
  autonomousRepairs?: number;
  manualRepairs?: number;
  failed?: number;
  divergenceRisk?: number;
  queuePressure?: number;
}) {
  const recoveryScore =
    computeReplayAutonomousRecoveryScore(args);

  return {
    autonomousRecoveryVersion: 1,
    deterministicAutonomousRecovery: true,
    autonomousRecoveryScore:
      recoveryScore,
    selfHealingAnalytics:
      buildReplaySelfHealingAnalytics(args),
    convergenceForecast:
      forecastReplayRecoveryConvergence({
        divergenceRisk:
          args.divergenceRisk,
        recoveryScore,
        queuePressure:
          args.queuePressure
      })
  };
}
