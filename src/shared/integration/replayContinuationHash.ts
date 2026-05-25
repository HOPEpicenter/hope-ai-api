import {
  buildDeterministicSnapshotHash
} from "./deterministicSnapshotHash";

export function buildReplayContinuationHash(args: {
  cursor?: string | null;
  checkpointHash?: string | null;
  replayHash?: string | null;
  continuationToken?: string | null;
}) {
  return buildDeterministicSnapshotHash({
    cursor:
      args.cursor ?? null,
    checkpointHash:
      args.checkpointHash ?? null,
    replayHash:
      args.replayHash ?? null,
    continuationToken:
      args.continuationToken ?? null
  });
}
