import assert from "node:assert/strict";
import {
  RESEND_DELIVERY_EVIDENCE_EVENT_TYPES
} from "../../src/contracts/ministryEmailProviderEvidence.v1";
import type {
  PersistedMinistryEmailProviderEvidenceV1
} from "../../src/contracts/ministryEmailProviderEvidencePersistence.v1";
import type {
  MinistryEmailDeliveryProvider
} from "../../src/domain/communications/ministryEmailDeliveryContracts";
import type {
  MinistryEmailProviderEvidenceRepository
} from "../../src/repositories/ministryEmailProviderEvidenceRepository";
import {
  persistMinistryEmailProviderEvidence
} from "../../src/services/communications/persistMinistryEmailProviderEvidence";

const input = {
  eventType: "processed" as const,
  evidence: {
    schemaVersion: 1 as const,
    kind: "provider_accepted" as const,
    source: "verified_provider_event" as const,
    deliveryId: "delivery-1",
    dispatchAttemptId: "attempt-1",
    provider: "sendgrid" as const,
    evidenceId: "event-1",
    observedAt: "2026-10-05T17:00:00.000Z",
    providerMessageId: "message-1"
  }
};

class MemoryRepository
implements MinistryEmailProviderEvidenceRepository {
  rows =
    new Map<
      string,
      PersistedMinistryEmailProviderEvidenceV1
    >();

  createCalls = 0;
  readCalls = 0;
  throwAfterCreate = false;
  throwBeforeCreate = false;
  throwOnRead = false;

  key(
    provider: MinistryEmailDeliveryProvider,
    evidenceId: string
  ): string {
    return `${provider}:${evidenceId}`;
  }

  async read(
    provider: MinistryEmailDeliveryProvider,
    evidenceId: string
  ): Promise<PersistedMinistryEmailProviderEvidenceV1 | null> {
    this.readCalls += 1;

    if (this.throwOnRead) {
      throw new Error(
        "read unavailable"
      );
    }

    const value = this.rows.get(
      this.key(
        provider,
        evidenceId
      )
    );

    return value
      ? structuredClone(value)
      : null;
  }

  async create(
    record: PersistedMinistryEmailProviderEvidenceV1
  ): Promise<boolean> {
    this.createCalls += 1;

    if (this.throwBeforeCreate) {
      throw new Error(
        "write unavailable"
      );
    }

    // Yield once so concurrent callers can both observe the initial miss.
    await Promise.resolve();

    const key = this.key(
      record.provider,
      record.evidenceId
    );

    if (this.rows.has(key)) {
      return false;
    }

    this.rows.set(
      key,
      structuredClone(record)
    );

    if (this.throwAfterCreate) {
      this.throwAfterCreate = false;
      throw new Error(
        "lost create acknowledgement"
      );
    }

    return true;
  }
}

async function run(): Promise<void> {
  {
    const repository =
      new MemoryRepository();

    const result =
      await persistMinistryEmailProviderEvidence(
        input,
        repository
      );

    assert.equal(result.ok, true);

    if (!result.ok) {
      throw new Error(
        "expected persistence success"
      );
    }

    assert.equal(
      result.status,
      "persisted"
    );

    assert.equal(
      repository.rows.size,
      1
    );

    assert.equal(
      repository.createCalls,
      1
    );
  }

  {
    const repository =
      new MemoryRepository();

    const first =
      await persistMinistryEmailProviderEvidence(
        input,
        repository
      );

    assert.equal(first.ok, true);

    const replay =
      await persistMinistryEmailProviderEvidence(
        input,
        repository
      );

    assert.equal(replay.ok, true);

    if (!replay.ok) {
      throw new Error(
        "expected replay"
      );
    }

    assert.equal(
      replay.status,
      "replayed"
    );

    assert.equal(
      repository.createCalls,
      1
    );
  }

  {
    const repository =
      new MemoryRepository();

    const first =
      await persistMinistryEmailProviderEvidence(
        input,
        repository
      );

    assert.equal(first.ok, true);

    const conflictInput = {
      ...input,
      evidence: {
        ...input.evidence,
        providerMessageId:
          "different-message"
      }
    };

    const conflict =
      await persistMinistryEmailProviderEvidence(
        conflictInput,
        repository
      );

    assert.deepEqual(
      conflict,
      {
        ok: false,
        code:
          "PROVIDER_EVIDENCE_REPLAY_CONFLICT"
      }
    );

    assert.equal(
      repository.rows.size,
      1
    );
  }

  {
    const repository =
      new MemoryRepository();

    const [left, right] =
      await Promise.all([
        persistMinistryEmailProviderEvidence(
          input,
          repository
        ),
        persistMinistryEmailProviderEvidence(
          input,
          repository
        )
      ]);

    const statuses = [
      left,
      right
    ]
      .filter(
        (
          value
        ): value is Extract<
          typeof value,
          {
            ok: true;
          }
        > => value.ok
      )
      .map(value => value.status)
      .sort();

    assert.deepEqual(
      statuses,
      [
        "persisted",
        "replayed"
      ]
    );

    assert.equal(
      repository.rows.size,
      1
    );
  }

  {
    const repository =
      new MemoryRepository();

    repository.throwAfterCreate =
      true;

    const result =
      await persistMinistryEmailProviderEvidence(
        input,
        repository
      );

    assert.equal(result.ok, true);

    if (!result.ok) {
      throw new Error(
        "expected lost-ack replay"
      );
    }

    assert.equal(
      result.status,
      "replayed"
    );

    assert.equal(
      repository.rows.size,
      1
    );
  }

  {
    const repository =
      new MemoryRepository();

    repository.throwBeforeCreate =
      true;

    const result =
      await persistMinistryEmailProviderEvidence(
        input,
        repository
      );

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "PROVIDER_EVIDENCE_PERSISTENCE_UNCERTAIN"
      }
    );

    assert.equal(
      repository.rows.size,
      0
    );
  }

  {
    const repository =
      new MemoryRepository();

    repository.throwOnRead =
      true;

    const result =
      await persistMinistryEmailProviderEvidence(
        input,
        repository
      );

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "PROVIDER_EVIDENCE_PERSISTENCE_UNCERTAIN"
      }
    );

    assert.equal(
      repository.createCalls,
      0
    );
  }

  {
    const repository =
      new MemoryRepository();

    const invalid = {
      ...input,
      evidence: {
        ...input.evidence,
        deliveryId: ""
      }
    };

    const result =
      await persistMinistryEmailProviderEvidence(
        invalid,
        repository
      );

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVIDENCE"
      }
    );

    assert.equal(
      repository.readCalls,
      0
    );

    assert.equal(
      repository.createCalls,
      0
    );
  }

  for (
    const eventType of
    RESEND_DELIVERY_EVIDENCE_EVENT_TYPES
  ) {
    const repository =
      new MemoryRepository();

    const resendInput = {
      ...input,
      eventType,
      evidence: {
        ...input.evidence,
        provider: "resend" as const,
        evidenceId:
          `resend-${eventType}`
      }
    };

    const result =
      await persistMinistryEmailProviderEvidence(
        resendInput,
        repository
      );

    assert.equal(
      result.ok,
      true,
      `${eventType} must persist`
    );

    if (!result.ok) {
      throw new Error(
        `expected ${eventType} persistence`
      );
    }

    assert.equal(
      result.status,
      "persisted"
    );

    assert.equal(
      result.record.provider,
      "resend"
    );

    assert.equal(
      result.record.eventType,
      eventType
    );

    const replay =
      await persistMinistryEmailProviderEvidence(
        resendInput,
        repository
      );

    assert.equal(
      replay.ok,
      true
    );

    if (!replay.ok) {
      throw new Error(
        `expected ${eventType} replay`
      );
    }

    assert.equal(
      replay.status,
      "replayed"
    );

    assert.equal(
      repository.createCalls,
      1
    );
  }

  {
    const repository =
      new MemoryRepository();

    const unsupported = {
      ...input,
      eventType: "email.opened",
      evidence: {
        ...input.evidence,
        provider: "resend" as const
      }
    };

    const result =
      await persistMinistryEmailProviderEvidence(
        unsupported,
        repository
      );

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVIDENCE"
      }
    );

    assert.equal(
      repository.readCalls,
      0
    );

    assert.equal(
      repository.createCalls,
      0
    );
  }

  {
    const repository =
      new MemoryRepository();

    const unsupported = {
      ...input,
      eventType: "email.delivered",
      evidence: {
        ...input.evidence,
        provider: "ses" as const
      }
    };

    const result =
      await persistMinistryEmailProviderEvidence(
        unsupported,
        repository
      );

    assert.deepEqual(
      result,
      {
        ok: false,
        code:
          "INVALID_PROVIDER_EVIDENCE"
      }
    );

    assert.equal(
      repository.readCalls,
      0
    );

    assert.equal(
      repository.createCalls,
      0
    );
  }

  console.log(
    "persistMinistryEmailProviderEvidence.test.ts passed"
  );
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});