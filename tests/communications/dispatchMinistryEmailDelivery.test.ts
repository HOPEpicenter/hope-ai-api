import assert from "node:assert/strict";
import type { MinistryEmailDeliveryRecord } from "../../src/domain/communications/ministryEmailDeliveryContracts";
import {
  dispatchMinistryEmailDelivery,
  type MinistryEmailDispatchRepository
} from "../../src/services/communications/dispatchMinistryEmailDelivery";
import type {
  MinistryEmailDeliveryProviderAdapter,
  MinistryEmailProviderRequest,
  MinistryEmailProviderResult
} from "../../src/services/communications/ministryEmailDeliveryProvider";

const requested: MinistryEmailDeliveryRecord = {
  schemaVersion: 1,
  deliveryId: "delivery-orchestration-1",
  communicationId: "communication-1",
  visitorId: "visitor-1",
  channel: "email",
  state: "requested",
  requestedAt: "2026-10-03T12:00:00.000Z",
  requestedBy: "staff-1",
  subject: "Approved subject",
  body: "Approved body",
  recipientEmail: "canonical@example.org",
  eligibility: {
    phase5Enabled: true,
    contactConsent: true,
    emailPreference: "granted"
  },
  dispatchAttemptId: null,
  dispatchClaimedAt: null,
  provider: null,
  providerMessageId: null,
  providerAcceptedAt: null,
  failedAt: null,
  failureCode: null
};
const timestamp = "2026-10-03T12:10:00.000Z";
const accepted: MinistryEmailProviderResult = {
  accepted: true, provider: "sendgrid", providerMessageId: "fake-message-1"
};
const failed: MinistryEmailProviderResult = {
  accepted: false, provider: "sendgrid", failureCode: "known_rejection"
};

class FakeRepository implements MinistryEmailDispatchRepository {
  current: MinistryEmailDeliveryRecord | null = structuredClone(requested);
  version = 1;
  reads = 0;
  claims = 0;
  transitions = 0;
  onClaim: ((next: MinistryEmailDeliveryRecord) => boolean) | null = null;
  onTransition: ((next: MinistryEmailDeliveryRecord) => boolean) | null = null;

  async readVersionedById() {
    this.reads += 1;
    return this.current
      ? { record: structuredClone(this.current), version: `v${this.version}` }
      : null;
  }
  async claimIfVersion(next: MinistryEmailDeliveryRecord, version: string) {
    this.claims += 1;
    if (this.onClaim) return this.onClaim(next);
    if (!this.current || this.current.state !== "requested" ||
        version !== `v${this.version}`) return false;
    this.current = structuredClone(next);
    this.version += 1;
    return true;
  }
  async transitionIfVersion(next: MinistryEmailDeliveryRecord, version: string) {
    this.transitions += 1;
    if (this.onTransition) return this.onTransition(next);
    if (!this.current || this.current.state !== "dispatching" ||
        this.current.dispatchAttemptId !== next.dispatchAttemptId ||
        version !== `v${this.version}`) return false;
    this.current = structuredClone(next);
    this.version += 1;
    return true;
  }
}

class FakeProvider implements MinistryEmailDeliveryProviderAdapter {
  calls = 0;
  requests: MinistryEmailProviderRequest[] = [];
  result = accepted;
  onSend: (() => void) | null = null;

  async send(request: MinistryEmailProviderRequest) {
    this.calls += 1;
    this.requests.push(structuredClone(request));
    this.onSend?.();
    return structuredClone(this.result);
  }
}

function fixture() {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const dependencies = {
    repository, provider,
    getFlags: () => ({
      phase5Communications: true,
      ministryEmailProviderSending: true
    }),
    createDispatchAttemptId: () => "attempt-1",
    now: () => timestamp
  };
  const dispatch = () => dispatchMinistryEmailDelivery(
    requested.deliveryId, dependencies
  );
  return { repository, provider, dependencies, dispatch };
}

async function run(): Promise<void> {
  for (const disabled of ["phase5", "sending"] as const) {
    const f = fixture();
    f.dependencies.getFlags = () => ({
      phase5Communications: disabled !== "phase5",
      ministryEmailProviderSending: disabled !== "sending"
    });
    assert.equal((await f.dispatch()).status,
      disabled === "phase5" ? "phase5_disabled" : "provider_sending_disabled");
    assert.equal(f.repository.reads, 0);
    assert.equal(f.repository.claims, 0);
    assert.equal(f.provider.calls, 0);
    assert.deepEqual(f.repository.current, requested);
  }

  const success = fixture();
  assert.equal((await success.dispatch()).status, "provider_accepted");
  assert.equal(success.repository.current?.providerMessageId, "fake-message-1");
  assert.equal(success.repository.current?.dispatchAttemptId, "attempt-1");
  assert.deepEqual(success.provider.requests, [{
    deliveryId: requested.deliveryId,
    recipientEmail: requested.recipientEmail,
    subject: requested.subject,
    body: requested.body
  }]);
  assert.equal((await success.dispatch()).status, "already_terminal");
  assert.equal(success.provider.calls, 1);

  const rejection = fixture();
  rejection.provider.result = failed;
  assert.equal((await rejection.dispatch()).status, "provider_failed");
  assert.equal(rejection.repository.current?.failureCode, "known_rejection");
  assert.equal((await rejection.dispatch()).status, "already_terminal");
  assert.equal(rejection.provider.calls, 1);

  const missing = fixture();
  missing.repository.current = null;
  assert.equal((await missing.dispatch()).status, "delivery_not_found");
  assert.equal(missing.provider.calls, 0);

  const claimed = fixture();
  claimed.repository.current = {
    ...requested, state: "dispatching",
    dispatchAttemptId: "old-attempt", dispatchClaimedAt: timestamp
  };
  assert.equal((await claimed.dispatch()).status,
    "already_dispatching_reconciliation_required");
  assert.equal(claimed.repository.claims, 0);
  assert.equal(claimed.provider.calls, 0);

  const conflict = fixture();
  conflict.repository.onClaim = () => {
    conflict.repository.version += 1;
    return false;
  };
  assert.equal((await conflict.dispatch()).status, "claim_conflict");
  assert.equal(conflict.provider.calls, 0);
  assert.equal(conflict.repository.current?.state, "requested");

  const replay = fixture();
  replay.repository.onClaim = next => {
    replay.repository.current = structuredClone(next);
    replay.repository.version += 1;
    return false;
  };
  assert.equal((await replay.dispatch()).status,
    "already_dispatching_reconciliation_required");
  assert.equal(replay.provider.calls, 0);

  const uncertainClaim = fixture();
  uncertainClaim.repository.onClaim = next => {
    uncertainClaim.repository.current = structuredClone(next);
    throw new Error("Simulated lost storage acknowledgement");
  };
  assert.equal((await uncertainClaim.dispatch()).status,
    "claim_persistence_uncertain");
  assert.equal(uncertainClaim.provider.calls, 0);
  await uncertainClaim.dispatch();
  assert.equal(uncertainClaim.provider.calls, 0);

  const providerThrows = fixture();
  providerThrows.provider.onSend = () => {
    throw new Error("Simulated uncertain external execution");
  };
  const uncertain = await providerThrows.dispatch();
  assert.equal(uncertain.status, "provider_execution_uncertain");
  assert.equal(uncertain.reconciliationRequired, true);
  assert.equal(providerThrows.repository.current?.state, "dispatching");
  assert.equal(providerThrows.repository.transitions, 0);
  await providerThrows.dispatch();
  assert.equal(providerThrows.provider.calls, 1);

  const wrongAttempt = fixture();
  wrongAttempt.provider.onSend = () => {
    wrongAttempt.repository.current!.dispatchAttemptId = "different-attempt";
    wrongAttempt.repository.version += 1;
  };
  assert.equal((await wrongAttempt.dispatch()).status,
    "provider_result_persistence_conflict");
  assert.equal(wrongAttempt.repository.transitions, 0);
  assert.equal(wrongAttempt.provider.calls, 1);

  const race = fixture();
  race.repository.onTransition = next => {
    race.repository.current = structuredClone(next);
    race.repository.version += 1;
    return false;
  };
  assert.equal((await race.dispatch()).status, "provider_accepted");
  assert.equal(race.provider.calls, 1);

  const conflictingRace = fixture();
  conflictingRace.repository.onTransition = next => {
    conflictingRace.repository.current = {
      ...next, state: "failed", providerMessageId: null,
      providerAcceptedAt: null, failedAt: timestamp,
      failureCode: "different-result"
    };
    conflictingRace.repository.version += 1;
    return false;
  };
  assert.equal((await conflictingRace.dispatch()).status,
    "provider_result_persistence_conflict");
  assert.equal(conflictingRace.repository.current?.state, "failed");
  assert.equal(conflictingRace.provider.calls, 1);

  const storageThrows = fixture();
  storageThrows.repository.onTransition = () => {
    throw new Error("Simulated storage outage");
  };
  assert.equal((await storageThrows.dispatch()).status,
    "provider_result_persistence_uncertain");
  assert.equal(storageThrows.repository.current?.state, "dispatching");
  await storageThrows.dispatch();
  assert.equal(storageThrows.provider.calls, 1);

  const concurrent = fixture();
  const results = await Promise.all([
    concurrent.dispatch(), concurrent.dispatch()
  ]);
  assert.equal(results.filter(r => r.status === "provider_accepted").length, 1);
  assert.equal(concurrent.provider.calls, 1,
    "concurrent identical attempts invoke provider exactly once");
  assert.equal(concurrent.repository.current?.state, "provider_accepted");

  console.log("dispatchMinistryEmailDelivery.test.ts passed");
}

run().catch(() => {
  console.error("dispatchMinistryEmailDelivery.test.ts failed");
  process.exitCode = 1;
});
