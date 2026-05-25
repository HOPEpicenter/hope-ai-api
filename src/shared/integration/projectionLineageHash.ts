import {
  buildDeterministicSnapshotHash
} from "./deterministicSnapshotHash";

export function buildProjectionLineageHash(args: {
  replayHash?: string | null;
  snapshotHash?: string | null;
  checkpointHash?: string | null;
  continuationHash?: string | null;
}) {
  return buildDeterministicSnapshotHash({
    replayHash:
      args.replayHash ?? null,
    snapshotHash:
      args.snapshotHash ?? null,
    checkpointHash:
      args.checkpointHash ?? null,
    continuationHash:
      args.continuationHash ?? null
  });
}
