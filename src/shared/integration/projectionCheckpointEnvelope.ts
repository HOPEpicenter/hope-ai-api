import {
  buildReplayCheckpointHash
} from "./replayCheckpointHash";

export function buildProjectionCheckpointEnvelope(args: {
  visitorId?: string | null;
  replayHash?: string | null;
  snapshotHash?: string | null;
  cursor?: string | null;
  lineageDepth?: number;
}) {
  return {
    checkpointVersion: 1,
    deterministicCheckpoint: true,
    visitorId:
      args.visitorId ?? null,
    replayHash:
      args.replayHash ?? null,
    snapshotHash:
      args.snapshotHash ?? null,
    cursor:
      args.cursor ?? null,
    lineageDepth:
      Number(args.lineageDepth ?? 0),
    checkpointHash:
      buildReplayCheckpointHash({
        visitorId:
          args.visitorId,
        replayHash:
          args.replayHash,
        snapshotHash:
          args.snapshotHash,
        cursor:
          args.cursor
      })
  };
}
