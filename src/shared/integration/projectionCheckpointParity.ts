import {
  buildReplayCheckpointHash
} from "./replayCheckpointHash";

export function compareProjectionCheckpoints(args: {
  current: unknown;
  rebuilt: unknown;
}) {
  const currentHash =
    buildReplayCheckpointHash({
      replayHash:
        JSON.stringify(args.current)
    });

  const rebuiltHash =
    buildReplayCheckpointHash({
      replayHash:
        JSON.stringify(args.rebuilt)
    });

  return {
    deterministicCheckpointParity:
      currentHash === rebuiltHash,
    currentHash,
    rebuiltHash
  };
}
