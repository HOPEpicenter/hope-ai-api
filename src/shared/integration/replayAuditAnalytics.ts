export function buildReplayAuditAnalytics(args: {
  verified?: number;
  anomalies?: number;
  overrides?: number;
}) {
  const verified =
    Number(args.verified ?? 0);

  const anomalies =
    Number(args.anomalies ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const total =
    verified + anomalies + overrides;

  const auditIntegrity =
    total > 0
      ? verified / total
      : 1;

  return {
    verified,
    anomalies,
    overrides,
    auditIntegrity,
    trusted:
      auditIntegrity >= 0.9 &&
      anomalies <= 1
  };
}
