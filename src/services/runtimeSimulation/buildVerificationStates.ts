import {
  buildRuntimeVerificationState
} from "../../shared/governance/runtimeVerificationState";

export function buildPolicyVerificationState(input: {
  policyProofs: Record<string, unknown>;
}) {
  return buildRuntimeVerificationState({
    versionKey: "policyVersion",
    version: 1,
    stateKey: "policyState",
    state: "ENFORCED_READ_ONLY",
    orchestrationKey:
      "orchestrationPolicy",
    orchestrationValue:
      "PROHIBITED",
    persistenceKey:
      "persistencePolicy",
    persistenceValue:
      "PROHIBITED",
    schedulerKey:
      "schedulerPolicy",
    schedulerValue:
      "PROHIBITED",
    mutationKey:
      "mutationPolicy",
    mutationValue:
      "PROHIBITED",
    executionKey:
      "executionPolicy",
    executionValue:
      "PROHIBITED",
    proofsKey:
      "policyProofs",
    proofs:
      input.policyProofs,
    stableKey:
      "policyStable"
  });
}

export function buildComplianceVerificationState(input: {
  complianceProofs: Record<string, unknown>;
}) {
  return buildRuntimeVerificationState({
    versionKey:
      "complianceVersion",
    version: 1,
    stateKey:
      "complianceState",
    state:
      "VERIFIED_READ_ONLY",
    orchestrationKey:
      "orchestrationCompliance",
    orchestrationValue:
      "VERIFIED_PROHIBITED",
    persistenceKey:
      "persistenceCompliance",
    persistenceValue:
      "VERIFIED_PROHIBITED",
    schedulerKey:
      "schedulerCompliance",
    schedulerValue:
      "VERIFIED_PROHIBITED",
    mutationKey:
      "mutationCompliance",
    mutationValue:
      "VERIFIED_PROHIBITED",
    executionKey:
      "executionCompliance",
    executionValue:
      "VERIFIED_PROHIBITED",
    proofsKey:
      "complianceProofs",
    proofs:
      input.complianceProofs,
    stableKey:
      "complianceStable"
  });
}

export function buildAttestationVerificationState(input: {
  attestationProofs: Record<string, unknown>;
}) {
  return buildRuntimeVerificationState({
    versionKey:
      "attestationVersion",
    version: 1,
    stateKey:
      "attestationState",
    state:
      "TRUST_VERIFIED_READ_ONLY",
    orchestrationKey:
      "orchestrationAttestation",
    orchestrationValue:
      "ATTESTED_PROHIBITED",
    persistenceKey:
      "persistenceAttestation",
    persistenceValue:
      "ATTESTED_PROHIBITED",
    schedulerKey:
      "schedulerAttestation",
    schedulerValue:
      "ATTESTED_PROHIBITED",
    mutationKey:
      "mutationAttestation",
    mutationValue:
      "ATTESTED_PROHIBITED",
    executionKey:
      "executionAttestation",
    executionValue:
      "ATTESTED_PROHIBITED",
    proofsKey:
      "attestationProofs",
    proofs:
      input.attestationProofs,
    stableKey:
      "attestationStable"
  });
}