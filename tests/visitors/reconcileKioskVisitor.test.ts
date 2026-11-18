import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reconcileKioskVisitor
} from "../../src/services/visitors/reconcileKioskVisitor";

const EVENT = "friends-family-2026-11-22";
const ID = "12345678-1234-4234-8234-123456789abc";

function fixture(overrides: Record<string, unknown> = {}) {
  let version = 1;
  let creates = 0;
  let failCompletion = false;

  const row: Record<string, any> = {
    partitionKey: EVENT,
    rowKey: ID,
    source: "hope_ipad_kiosk_v1",
    reviewStatus: "pending",
    name: "Synthetic Visitor",
    email: "guest@example.test",
    phone: "",
    visitType: "first",
    contactConsent: true,
    etag: "v1",
    ...overrides
  };

  const table = {
    async getEntity(pk: string, rk: string) {
      assert.equal(pk, EVENT);
      assert.equal(rk, ID);
      return { ...row };
    },
    async updateEntity(
      entity: Record<string, any>,
      mode: "Merge",
      options: { etag: string }
    ) {
      assert.equal(mode, "Merge");
      if (options.etag !== row.etag) {
        throw { statusCode: 412 };
      }
      if (failCompletion && entity.reviewStatus === "imported") {
        throw new Error("synthetic completion failure");
      }
      Object.assign(row, entity);
      version++;
      row.etag = `v${version}`;
    }
  };

  const createVisitor = async (input: any): Promise<any> => {
    creates++;
    assert.equal(input.name, "Synthetic Visitor");
    return {
      created: true,
      visitor: { visitorId: "synthetic-canonical-visitor" }
    };
  };

  return {
    row,
    table,
    createVisitor,
    get creates() { return creates; },
    setFailCompletion(value: boolean) {
      failCompletion = value;
    }
  };
}

const request = {
  submissionId: ID,
  enabled: true as const,
  administratorAuthorized: true as const
};

test("imports one canonical visitor and records its identity", async () => {
  const f = fixture();
  const result = await reconcileKioskVisitor(request, f);

  assert.equal(result.status, "imported");
  assert.equal(f.creates, 1);
  assert.equal(f.row.reviewStatus, "imported");
  assert.equal(
    f.row.canonicalVisitorId,
    "synthetic-canonical-visitor"
  );
});

test("second import cannot create another visitor", async () => {
  const f = fixture();
  await reconcileKioskVisitor(request, f);
  const second = await reconcileKioskVisitor(request, f);

  assert.equal(second.status, "already_claimed");
  assert.equal(f.creates, 1);
});

test("declined consent does not authorize follow-up", async () => {
  const f = fixture({ contactConsent: false });
  const result = await reconcileKioskVisitor(request, f);

  assert.equal(result.status, "imported");
  if (result.status === "imported") {
    assert.equal(result.eligibleForStaffFollowup, false);
  }
});

test("returning visitor requires history review", async () => {
  const f = fixture({ visitType: "returning" });
  const result = await reconcileKioskVisitor(request, f);

  assert.equal(result.status, "imported");
  if (result.status === "imported") {
    assert.equal(result.requiresVisitHistoryReview, true);
  }
});

test("import is denied without trusted authorization", async () => {
  const f = fixture();

  const result = await reconcileKioskVisitor({
    ...request,
    administratorAuthorized: false as never
  }, f);

  assert.equal(result.status, "not_authorized");
  assert.equal(f.creates, 0);
});

test("previously claimed submission cannot be imported", async () => {
  const f = fixture({ reviewStatus: "importing" });
  const result = await reconcileKioskVisitor(request, f);

  assert.equal(result.status, "already_claimed");
  assert.equal(f.creates, 0);
});

test("failed completion requires manual recovery", async () => {
  const f = fixture();
  f.setFailCompletion(true);

  const result = await reconcileKioskVisitor(request, f);

  assert.equal(result.status, "manual_recovery_required");
  assert.equal(f.creates, 1);
  assert.equal(f.row.reviewStatus, "importing");
});

test("invalid submission identifier causes no writes", async () => {
  const f = fixture();
  const result = await reconcileKioskVisitor({
    ...request,
    submissionId: "invalid"
  }, f);

  assert.equal(result.status, "invalid");
  assert.equal(f.creates, 0);
});
