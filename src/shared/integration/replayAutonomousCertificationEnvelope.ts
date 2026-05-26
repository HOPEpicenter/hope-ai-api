import {
  computeReplayCertificationScore
} from "./replayCertificationScore";

import {
  buildReplayVerificationAnalytics
} from "./replayVerificationAnalytics";

import {
  forecastReplayCertificationDrift
} from "./replayCertificationDriftForecast";

export function buildReplayAutonomousCertificationEnvelope(args: {
  certified?: number;
  failed?: number;
  overrides?: number;
  queuePressure?: number;
}) {
  return {
    certificationVersion: 1,
    deterministicCertification: true,
    certificationScore:
      computeReplayCertificationScore(args),
    verificationAnalytics:
      buildReplayVerificationAnalytics(args),
    certificationForecast:
      forecastReplayCertificationDrift(args)
  };
}
