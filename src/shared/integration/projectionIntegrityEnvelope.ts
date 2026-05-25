export type ProjectionIntegrityEnvelope = {
  projectionIntegrity: {
    deterministicReplay: true;
    cursorNormalized: boolean;
    shadowMode?: boolean;
    shadowEquivalent?: boolean | null;
    orphanProfilesExcluded?: number;
  };
};

export function buildProjectionIntegrityEnvelope(args: {
  cursor?: string;
  shadowMode?: boolean;
  shadowEquivalent?: boolean | null;
  orphanProfilesExcluded?: number;
}): ProjectionIntegrityEnvelope {
  return {
    projectionIntegrity: {
      deterministicReplay: true,
      cursorNormalized: true,
      shadowMode: Boolean(args.shadowMode),
      shadowEquivalent:
        args.shadowEquivalent ?? null,
      orphanProfilesExcluded:
        args.orphanProfilesExcluded ?? 0
    }
  };
}
