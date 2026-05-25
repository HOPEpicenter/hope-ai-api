import {
  buildReplayContinuationHash
} from "./replayContinuationHash";

export function compareReplayContinuations(args: {
  current: unknown;
  resumed: unknown;
}) {
  const currentHash =
    buildReplayContinuationHash({
      replayHash:
        JSON.stringify(args.current)
    });

  const resumedHash =
    buildReplayContinuationHash({
      replayHash:
        JSON.stringify(args.resumed)
    });

  return {
    deterministicContinuationParity:
      currentHash === resumedHash,
    currentHash,
    resumedHash
  };
}
