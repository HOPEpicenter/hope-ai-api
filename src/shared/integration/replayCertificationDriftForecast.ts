export function forecastReplayCertificationDrift(args: {
  failed?: number;
  overrides?: number;
  queuePressure?: number;
}) {
  const failed =
    Number(args.failed ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const pressure =
    Number(args.queuePressure ?? 0);

  const certificationDriftRisk =
    Math.max(
      0,
      Math.min(
        1,
        (failed * 0.2) +
        (overrides * 0.1) +
        (pressure * 0.35)
      )
    );

  return {
    failed,
    overrides,
    queuePressure: pressure,
    certificationDriftRisk,
    certificationDrifting:
      certificationDriftRisk >= 0.5
  };
}
