export function buildReplayVerificationAnalytics(args: {
  certified?: number;
  failed?: number;
  overrides?: number;
}) {
  const certified =
    Number(args.certified ?? 0);

  const failed =
    Number(args.failed ?? 0);

  const overrides =
    Number(args.overrides ?? 0);

  const total =
    certified + failed + overrides;

  const verificationIntegrity =
    total > 0
      ? certified / total
      : 1;

  return {
    certified,
    failed,
    overrides,
    verificationIntegrity,
    verified:
      verificationIntegrity >= 0.9 &&
      failed <= 1
  };
}
