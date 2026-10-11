import assert from "node:assert/strict";

import {
  OAuthOrderingCoordinationRepository,
  OAUTH_ORDERING_PARTITION_KEY,
  type OAuthOrderingTablePort,
  type OAuthOrderingTableEntity,
  type OAuthOrderingWriteEntity
} from "../../src/repositories/oauthOrderingCoordinationRepository";

import {
  initialOAuthOrderingSnapshot,
  type OAuthOrderingSnapshot
} from "../../src/services/authorization/modelOAuthRevocationOrdering";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Failure = "none" | "before_commit" | "after_commit";

class FakeTable implements OAuthOrderingTablePort {
  entity: OAuthOrderingTableEntity | null;
  writes = 0;
  failure: Failure = "none";
  readFailure = false;

  constructor(
    snapshot: unknown = initialOAuthOrderingSnapshot()
  ) {
    this.entity = {
      partitionKey: OAUTH_ORDERING_PARTITION_KEY,
      rowKey: ID,
      snapshotJson: JSON.stringify(snapshot),
      etag: "version-0"
    };
  }

  async getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthOrderingTableEntity> {
    if (this.readFailure) {
      throw new Error("read outcome unavailable");
    }

    if (
      !this.entity ||
      partitionKey !== this.entity.partitionKey ||
      rowKey !== this.entity.rowKey
    ) {
      throw Object.assign(new Error("missing"), {
        statusCode: 404
      });
    }

    // Let competing workers read the same pre-commit ETag.
    await new Promise<void>(
      resolve => setImmediate(resolve)
    );

    return { ...this.entity };
  }

  async updateEntity(
    data: OAuthOrderingWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<unknown> {
    if (this.failure === "before_commit") {
      throw new Error("write acknowledgement unavailable");
    }

    // No await between ETag comparison and replacement.
    // This deliberately simulates one atomic CAS point.
    if (
      mode !== "Replace" ||
      !this.entity ||
      options.etag !== this.entity.etag
    ) {
      throw Object.assign(new Error("etag conflict"), {
        statusCode: 412
      });
    }

    this.writes++;

    this.entity = {
      ...data,
      etag: `version-${this.writes}`
    };

    if (this.failure === "after_commit") {
      throw new Error("acknowledgement lost after commit");
    }

    return undefined;
  }

  snapshot(): OAuthOrderingSnapshot {
    if (!this.entity) throw Error("Missing entity");

    return JSON.parse(
      this.entity.snapshotJson
    ) as OAuthOrderingSnapshot;
  }
}

async function main(): Promise<void> {
  // A real conditional commit must choose one winner.
  const table = new FakeTable();

  const workers = Array.from(
    { length: 30 },
    () => new OAuthOrderingCoordinationRepository(table)
  );

  const results = await Promise.all(
    workers.map((repository, i) =>
      repository.tryTransition(ID, {
        kind: "claim",
        expectedRevision: 0,
        claimId: `claim-${i}`
      })
    )
  );

  assert.equal(
    results.filter(r => r.outcome === "committed").length,
    1
  );

  assert.equal(
    results.filter(r => r.outcome === "denied").length,
    29
  );

  assert.equal(table.writes, 1);
  assert.equal(table.snapshot().revision, 1);
  assert.equal(table.snapshot().state, "claimed");

  assert.ok(results.every(r => !r.executionPermitted));

  // Competing claim versus revocation:
  // exactly one can commit from revision zero.
  const raceTable = new FakeTable();
  const raceRepo = new OAuthOrderingCoordinationRepository(
    raceTable
  );

  const race = await Promise.all([
    raceRepo.tryTransition(ID, {
      kind: "claim",
      expectedRevision: 0,
      claimId: "claim-a"
    }),
    raceRepo.tryTransition(ID, {
      kind: "revoke",
      expectedRevision: 0,
      source: "staff_deactivation"
    })
  ]);

  assert.equal(
    race.filter(r => r.outcome === "committed").length,
    1
  );

  assert.equal(raceTable.writes, 1);
  assert.equal(raceTable.snapshot().revision, 1);

  // Capture the winner BEFORE applying the next transition.
  const firstCommittedState = raceTable.snapshot().state;

  // A post-claim revocation must become pending.
  const pending = await raceRepo.tryTransition(ID, {
    kind: "revoke",
    expectedRevision: 1,
    source: "session_revocation"
  });

  if (firstCommittedState === "claimed") {
    assert.equal(pending.outcome, "committed");
    assert.equal(
      raceTable.snapshot().state,
      "revocation_pending"
    );
  } else {
    assert.equal(firstCommittedState, "revoked");
    assert.equal(pending.outcome, "denied");
    assert.equal(raceTable.snapshot().state, "revoked");
  }

  // Stale revisions cannot commit.
  const stale = await new OAuthOrderingCoordinationRepository(
    table
  ).tryTransition(ID, {
    kind: "claim",
    expectedRevision: 0,
    claimId: "stale"
  });

  assert.equal(stale.outcome, "denied");

  // Missing or invalid storage evidence fails closed.
  const missing = new FakeTable();
  missing.entity = null;

  assert.equal(
    (await new OAuthOrderingCoordinationRepository(
      missing
    ).tryTransition(ID, {
      kind: "claim",
      expectedRevision: 0,
      claimId: "a"
    })).outcome,
    "denied"
  );

  const malformed = new FakeTable({ revision: "bad" });

  assert.equal(
    (await new OAuthOrderingCoordinationRepository(
      malformed
    ).tryTransition(ID, {
      kind: "claim",
      expectedRevision: 0,
      claimId: "a"
    })).outcome,
    "denied"
  );

  for (const etag of ["", "*"]) {
    const invalidEtag = new FakeTable();
    if (!invalidEtag.entity) throw Error("Missing fixture");
    invalidEtag.entity.etag = etag;

    assert.equal(
      (await new OAuthOrderingCoordinationRepository(
        invalidEtag
      ).tryTransition(ID, {
        kind: "claim",
        expectedRevision: 0,
        claimId: "a"
      })).outcome,
      "denied"
    );
  }

  // A read outage cannot establish a commit.
  const readOutage = new FakeTable();
  readOutage.readFailure = true;

  assert.equal(
    (await new OAuthOrderingCoordinationRepository(
      readOutage
    ).tryTransition(ID, {
      kind: "claim",
      expectedRevision: 0,
      claimId: "a"
    })).outcome,
    "uncertain"
  );

  // A write can fail before committing.
  const before = new FakeTable();
  before.failure = "before_commit";

  const beforeResult =
    await new OAuthOrderingCoordinationRepository(
      before
    ).tryTransition(ID, {
      kind: "claim",
      expectedRevision: 0,
      claimId: "a"
    });

  assert.equal(beforeResult.outcome, "uncertain");
  assert.equal(before.writes, 0);

  // A write can commit but lose the acknowledgement.
  const after = new FakeTable();
  after.failure = "after_commit";

  const afterResult =
    await new OAuthOrderingCoordinationRepository(
      after
    ).tryTransition(ID, {
      kind: "claim",
      expectedRevision: 0,
      claimId: "a"
    });

  assert.equal(afterResult.outcome, "uncertain");
  assert.equal(after.writes, 1);
  assert.equal(after.snapshot().state, "claimed");

  // Do not retry a possibly committed claim blindly.
  const repeat = await new OAuthOrderingCoordinationRepository(
    after
  ).tryTransition(ID, {
    kind: "claim",
    expectedRevision: 0,
    claimId: "a"
  });

  assert.equal(repeat.outcome, "denied");
  assert.equal(after.writes, 1);

  // No invalid identity can commit.
  const badId = new FakeTable();

  assert.equal(
    (await new OAuthOrderingCoordinationRepository(
      badId
    ).tryTransition("not-a-uuid", {
      kind: "claim",
      expectedRevision: 0,
      claimId: "a"
    })).outcome,
    "denied"
  );

  assert.equal(badId.writes, 0);

  console.log(
    "OAuth ordering conditional-commit synthetic tests passed"
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
