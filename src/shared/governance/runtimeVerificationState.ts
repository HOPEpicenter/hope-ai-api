export function buildRuntimeVerificationState(args: {
  versionKey: string;
  version: number;
  stateKey: string;
  state: string;
  orchestrationKey: string;
  orchestrationValue: string;
  persistenceKey: string;
  persistenceValue: string;
  schedulerKey: string;
  schedulerValue: string;
  mutationKey: string;
  mutationValue: string;
  executionKey: string;
  executionValue: string;
  proofsKey: string;
  proofs: Record<string, unknown>;
  stableKey: string;
}) {
  return {
    deterministic: true,
    [args.versionKey]: args.version,
    [args.stateKey]: args.state,
    [args.orchestrationKey]: args.orchestrationValue,
    [args.persistenceKey]: args.persistenceValue,
    [args.schedulerKey]: args.schedulerValue,
    [args.mutationKey]: args.mutationValue,
    [args.executionKey]: args.executionValue,
    simulatedOnly: true,
    [args.proofsKey]: args.proofs,
    [args.stableKey]: true
  };
}