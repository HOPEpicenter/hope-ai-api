'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcile, STATES } = require('./reconciliation.cjs');

function valid() {
  const operation = {
    operationId: 'synthetic-operation-1',
    generation: 8,
    digest: 'synthetic-digest'
  };

  return {
    trustedGeneration: 7,
    evidenceAvailable: true,
    receiptIntegrityVerified: true,
    independentVerifierVerified: true,
    reservationVerified: true,
    authorizationVerified: true,
    canonicalResultVerified: true,
    intent: { ...operation, predecessor: 7 },
    state: { ...operation },
    completion: { ...operation }
  };
}

function check(input, expected) {
  const result = reconcile(input);
  assert.equal(result.state, expected);
  assert.equal(
    result.authorityAccepted,
    expected === STATES.VERIFIED
  );
}

test('complete independently verified operation', () => {
  check(valid(), STATES.VERIFIED);
});

test('no evidence denies authority', () => {
  const x = valid();
  x.evidenceAvailable = false;
  check(x, STATES.UNVERIFIED);
});

test('no operation evidence denies authority', () => {
  const x = valid();
  x.intent = null;
  x.state = null;
  x.completion = null;
  check(x, STATES.UNVERIFIED);
});

test('intent without state requires recovery', () => {
  const x = valid();
  x.state = null;
  x.completion = null;
  check(x, STATES.RECOVERY_REQUIRED);
});

test('Table success without completion requires recovery', () => {
  const x = valid();
  x.completion = null;
  check(x, STATES.RECOVERY_REQUIRED);
});

test('completion without Table state is conflict', () => {
  const x = valid();
  x.state = null;
  check(x, STATES.SECURITY_CONFLICT);
});

test('missing intent cannot be accepted', () => {
  const x = valid();
  x.intent = null;
  check(x, STATES.SECURITY_CONFLICT);
});

test('generation gap is rejected', () => {
  const x = valid();
  x.intent.generation = 9;
  check(x, STATES.SECURITY_CONFLICT);
});

test('wrong predecessor is rejected', () => {
  const x = valid();
  x.intent.predecessor = 6;
  check(x, STATES.SECURITY_CONFLICT);
});

test('altered Table state is rejected', () => {
  const x = valid();
  x.state.digest = 'altered';
  check(x, STATES.SECURITY_CONFLICT);
});

test('altered completion is rejected', () => {
  const x = valid();
  x.completion.digest = 'altered';
  check(x, STATES.SECURITY_CONFLICT);
});

test('receipt integrity failure is rejected', () => {
  const x = valid();
  x.receiptIntegrityVerified = false;
  check(x, STATES.SECURITY_CONFLICT);
});

test('unverified independent verifier denies', () => {
  const x = valid();
  x.independentVerifierVerified = false;
  check(x, STATES.UNVERIFIED);
});

test('missing durable reservation denies', () => {
  const x = valid();
  x.reservationVerified = false;
  check(x, STATES.UNVERIFIED);
});

test('missing authorization denies', () => {
  const x = valid();
  x.authorizationVerified = false;
  check(x, STATES.UNVERIFIED);
});

test('unverified canonical result denies', () => {
  const x = valid();
  x.canonicalResultVerified = false;
  check(x, STATES.UNVERIFIED);
});

test('conflicting duplicate is rejected', () => {
  const x = valid();
  x.conflictingDuplicate = true;
  check(x, STATES.SECURITY_CONFLICT);
});

test('replayed revocation is rejected', () => {
  const x = valid();
  x.replayedRevocation = true;
  check(x, STATES.SECURITY_CONFLICT);
});

test('invalid input denies authority', () => {
  check(null, STATES.UNVERIFIED);
});

test('repeat classification is deterministic', () => {
  const x = valid();
  assert.deepEqual(reconcile(x), reconcile(x));
});
