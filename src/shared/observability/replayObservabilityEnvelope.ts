export function buildReplayObservabilityEnvelope(args: {
  replayHash: string;
  exportHash: string;
  snapshotHash: string;
  lineageReplayHash: string;
  replayDriftDetected: boolean;
  lineageConsistent: boolean;
}) {
  const telemetryAligned =
    args.replayHash.length > 0 &&
    args.exportHash.length > 0 &&
    args.snapshotHash.length > 0 &&
    args.lineageReplayHash === args.replayHash;

  return {
    deterministic: true,
    replayHash:
      args.replayHash,
    exportHash:
      args.exportHash,
    snapshotHash:
      args.snapshotHash,
    lineageReplayHash:
      args.lineageReplayHash,
    replayDriftDetected:
      args.replayDriftDetected,
    lineageConsistent:
      args.lineageConsistent,
    telemetryAligned
  };
}