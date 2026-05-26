export function buildReplayPredictiveSchedulingAnalytics(args: {
  scheduled?: number;
  delayed?: number;
  predictedDurationSeconds?: number;
}) {
  const scheduled =
    Number(args.scheduled ?? 0);

  const delayed =
    Number(args.delayed ?? 0);

  const predictedDuration =
    Number(
      args.predictedDurationSeconds ?? 0
    );

  const scheduleReliability =
    scheduled > 0
      ? (scheduled - delayed) / scheduled
      : 1;

  return {
    scheduled,
    delayed,
    predictedDurationSeconds:
      predictedDuration,
    scheduleReliability,
    stableScheduling:
      scheduleReliability >= 0.8
  };
}
