import {
  buildProjectionLineageHash
} from "./projectionLineageHash";

export function buildProjectionLineageEnvelope(args: {
  replayHash?: string | null;
  snapshotHash?: string | null;
  checkpointHash?: string | null;
  continuationHash?: string | null;
  lineageDepth?: number;
}) {
  return {
    lineageVersion: 1,
    deterministicLineage: true,
    replayHash:
      args.replayHash ?? null,
    snapshotHash:
      args.snapshotHash ?? null,
    checkpointHash:
      args.checkpointHash ?? null,
    continuationHash:
      args.continuationHash ?? null,
    lineageDepth:
      Number(args.lineageDepth ?? 0),
    lineageHash:
      buildProjectionLineageHash({
        replayHash:
          args.replayHash,
        snapshotHash:
          args.snapshotHash,
        checkpointHash:
          args.checkpointHash,
        continuationHash:
          args.continuationHash
      })
  };
}
