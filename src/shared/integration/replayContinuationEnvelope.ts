import {
  buildReplayContinuationHash
} from "./replayContinuationHash";

export function buildReplayContinuationEnvelope(args: {
  cursor?: string | null;
  checkpointHash?: string | null;
  replayHash?: string | null;
  continuationToken?: string | null;
  resumeDepth?: number;
}) {
  return {
    continuationVersion: 1,
    deterministicContinuation: true,
    cursor:
      args.cursor ?? null,
    checkpointHash:
      args.checkpointHash ?? null,
    replayHash:
      args.replayHash ?? null,
    continuationToken:
      args.continuationToken ?? null,
    resumeDepth:
      Number(args.resumeDepth ?? 0),
    continuationHash:
      buildReplayContinuationHash({
        cursor:
          args.cursor,
        checkpointHash:
          args.checkpointHash,
        replayHash:
          args.replayHash,
        continuationToken:
          args.continuationToken
      })
  };
}
