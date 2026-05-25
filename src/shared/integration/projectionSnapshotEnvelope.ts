import {
  buildDeterministicSnapshotHash
} from "./deterministicSnapshotHash";

export function buildProjectionSnapshotEnvelope(args: {
  replayHash?: string | null;
  snapshot?: unknown;
  snapshotMode?: string;
}) {
  const canonical = {
    replayHash:
      args.replayHash ?? null,
    snapshot:
      args.snapshot ?? null,
    snapshotMode:
      args.snapshotMode ??
      "IN_MEMORY_ONLY"
  };

  return {
    snapshotVersion: 1,
    deterministicSnapshot: true,
    snapshotMode:
      canonical.snapshotMode,
    snapshotHash:
      buildDeterministicSnapshotHash(
        canonical
      ),
    replayHash:
      canonical.replayHash,
    simulatedOnly: true
  };
}
