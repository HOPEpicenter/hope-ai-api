'use strict';

// Synthetic decision model only. Never grants live authority.
// No storage, identity, network, or recovery side effects.

const STATES = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  VERIFIED: 'VERIFIED',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
  SECURITY_CONFLICT: 'SECURITY_CONFLICT'
});

function reconcile(input) {
  const result = (state, reason) => Object.freeze({
    state,
    reason,
    authorityAccepted: state === STATES.VERIFIED
  });

  const unverified = reason =>
    result(STATES.UNVERIFIED, reason);
  const recovery = reason =>
    result(STATES.RECOVERY_REQUIRED, reason);
  const conflict = reason =>
    result(STATES.SECURITY_CONFLICT, reason);

  if (!input || typeof input !== 'object') {
    return unverified('INVALID_INPUT');
  }

  if (input.evidenceAvailable !== true) {
    return unverified('EVIDENCE_UNAVAILABLE');
  }

  if (input.conflictingDuplicate === true ||
      input.replayedRevocation === true) {
    return conflict('REPLAY_OR_DUPLICATE_CONFLICT');
  }

  const { intent, state, completion } = input;

  if (!intent && !state && !completion) {
    return unverified('NO_OPERATION_EVIDENCE');
  }

  if (!intent) {
    return conflict('MISSING_INTENT');
  }

  if (!Number.isSafeInteger(input.trustedGeneration) ||
      input.trustedGeneration < 0 ||
      !Number.isSafeInteger(intent.generation) ||
      intent.generation !== input.trustedGeneration + 1 ||
      intent.predecessor !== input.trustedGeneration ||
      typeof intent.operationId !== 'string' ||
      intent.operationId.length === 0 ||
      typeof intent.digest !== 'string' ||
      intent.digest.length === 0) {
    return conflict('INVALID_INTENT_CHAIN');
  }

  const matches = record =>
    record.operationId === intent.operationId &&
    record.generation === intent.generation &&
    record.digest === intent.digest;

  if (state && !matches(state)) {
    return conflict('TABLE_STATE_MISMATCH');
  }

  if (completion && !matches(completion)) {
    return conflict('COMPLETION_MISMATCH');
  }

  if (completion && !state) {
    return conflict('COMPLETION_WITHOUT_STATE');
  }

  if (input.receiptIntegrityVerified === false) {
    return conflict('RECEIPT_INTEGRITY_FAILURE');
  }

  if (!state || !completion) {
    return recovery('PARTIAL_PERSISTENCE');
  }

  if (input.receiptIntegrityVerified !== true ||
      input.independentVerifierVerified !== true ||
      input.reservationVerified !== true ||
      input.authorizationVerified !== true ||
      input.canonicalResultVerified !== true) {
    return unverified('VERIFICATION_INCOMPLETE');
  }

  return result(STATES.VERIFIED, 'ALL_SYNTHETIC_CHECKS_PASS');
}

module.exports = { STATES, reconcile };
