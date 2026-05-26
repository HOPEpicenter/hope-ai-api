export function forecastReplayTrustDrift(args: {
  anomalies?: number;
  overrides?: number;
  queuePressure?: number;
}) {
  const anomalies =
    Number(args.anomalies ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const trustDriftRisk =
    Math.max(
      0,
      Math.min(
        1,
        (anomalies * 0.2) +
        (overrides * 0.1) +
        (pressure * 0.35)
      )
    );

  return {
    anomalies,
    overrides,
    queuePressure: pressure,
    trustDriftRisk,
    trustDrifting:
      trustDriftRisk >= 0.5
  };
}
