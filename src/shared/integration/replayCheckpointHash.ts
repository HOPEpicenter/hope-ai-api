import {
  buildDeterministicSnapshotHash
} from "./deterministicSnapshotHash";

export function buildReplayCheckpointHash(args: {
  visitorId?: string | null;
  replayHash?: string | null;
  snapshotHash?: string | null;
  cursor?: string | null;
}) {
  return buildDeterministicSnapshotHash({
    visitorId:
      args.visitorId ?? null,
    replayHash:
      args.replayHash ?? null,
    snapshotHash:
      args.snapshotHash ?? null,
    cursor:
      args.cursor ?? null
  });
}
