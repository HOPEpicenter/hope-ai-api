import {
  buildDeterministicSnapshotHash
} from "./deterministicSnapshotHash";

export function compareProjectionSnapshots(args: {
  current: unknown;
  rebuilt: unknown;
}) {
  const currentHash =
    buildDeterministicSnapshotHash(
      args.current
    );

  const rebuiltHash =
    buildDeterministicSnapshotHash(
      args.rebuilt
    );

  return {
    deterministicParity:
      currentHash === rebuiltHash,
    currentHash,
    rebuiltHash
  };
}
