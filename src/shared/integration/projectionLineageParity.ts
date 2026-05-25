import {
  buildProjectionLineageHash
} from "./projectionLineageHash";

export function compareProjectionLineage(args: {
  current: unknown;
  rebuilt: unknown;
}) {
  const currentHash =
    buildProjectionLineageHash({
      replayHash:
        JSON.stringify(args.current)
    });

  const rebuiltHash =
    buildProjectionLineageHash({
      replayHash:
        JSON.stringify(args.rebuilt)
    });

  return {
    deterministicLineageParity:
      currentHash === rebuiltHash,
    currentHash,
    rebuiltHash
  };
}
