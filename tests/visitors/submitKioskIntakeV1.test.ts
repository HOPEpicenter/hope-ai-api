import assert from "node:assert/strict";
import { test } from "node:test";
import {
  submitKioskIntakeV1
} from "../../src/services/visitors/submitKioskIntakeV1";

const submissionId =
  "44444444-4444-4444-8444-444444444444";

const guest = {
  name: "Synthetic Guest",
  email: "guest@example.test",
  phone: "",
  visitType: "first",
  interests: ["church_events"],
  invitedBy: "",
  contactConsent: true
};

async function withEnabledFlag<T>(
  operation: () => Promise<T>
): Promise<T> {
  const previous =
    process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;

  process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED = "true";

  try {
    return await operation();
  } finally {
    if (previous === undefined) {
      delete process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;
    } else {
      process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED = previous;
    }
  }
}

test("feature disabled blocks authorized callback", async () => {
  const previous =
    process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;

  delete process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;

  try {
    let called = false;

    const result = await submitKioskIntakeV1(
      guest, submissionId, {
        authorizeRequest: async () => {
          called = true;
          return true;
        }
      }
    );

    assert.equal(result.status, "disabled");
    assert.equal(called, false);
  } finally {
    if (previous === undefined) {
      delete process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;
    } else {
      process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED = previous;
    }
  }
});

test("enabled flag alone cannot authorize submission", async () => {
  await withEnabledFlag(async () => {
    const result = await submitKioskIntakeV1(
      guest, submissionId
    );

    assert.deepEqual(result, {
      accepted: false,
      status: "not_authorized"
    });
  });
});

test("explicit authorization denial prevents storage", async () => {
  await withEnabledFlag(async () => {
    let persisted = false;

    const result = await submitKioskIntakeV1(
      guest, submissionId, {
        authorizeRequest: async () => false,
        persist: async () => {
          persisted = true;
          return { accepted: true, status: "recorded" };
        }
      }
    );

    assert.equal(result.status, "not_authorized");
    assert.equal(persisted, false);
  });
});

test("authorization exception fails closed", async () => {
  await withEnabledFlag(async () => {
    const result = await submitKioskIntakeV1(
      guest, submissionId, {
        authorizeRequest: async () => {
          throw new Error("ADMISSION_UNAVAILABLE");
        }
      }
    );

    assert.equal(result.status, "not_authorized");
  });
});

test("validated submission reaches trusted persistence", async () => {
  await withEnabledFlag(async () => {
    let calls = 0;

    const result = await submitKioskIntakeV1(
      guest, submissionId, {
        authorizeRequest: async () => true,
        persist: async (input, id, options) => {
          calls++;
          assert.equal(id, submissionId);
          assert.equal(options?.enabled, true);
          assert.equal((input as any).contactConsent, true);

          return { accepted: true, status: "recorded" };
        }
      }
    );

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      accepted: true,
      status: "recorded"
    });
  });
});

test("invalid guest data cannot reach storage", async () => {
  await withEnabledFlag(async () => {
    let persisted = false;

    const result = await submitKioskIntakeV1(
      { ...guest, admin: true },
      submissionId,
      {
        authorizeRequest: async () => true,
        persist: async () => {
          persisted = true;
          return { accepted: true, status: "recorded" };
        }
      }
    );

    assert.equal(result.status, "invalid");
    assert.equal(persisted, false);
  });
});

test("explicit refusal is preserved for persistence", async () => {
  await withEnabledFlag(async () => {
    const result = await submitKioskIntakeV1(
      { ...guest, contactConsent: false },
      submissionId,
      {
        authorizeRequest: async () => true,
        persist: async input => {
          assert.equal((input as any).contactConsent, false);
          return { accepted: true, status: "recorded" };
        }
      }
    );

    assert.equal(result.accepted, true);
  });
});

test("identical retry receipt is preserved", async () => {
  await withEnabledFlag(async () => {
    const result = await submitKioskIntakeV1(
      guest, submissionId,
      {
        authorizeRequest: async () => true,
        persist: async () => ({
          accepted: true,
          status: "already_recorded"
        })
      }
    );

    assert.deepEqual(result, {
      accepted: true,
      status: "already_recorded"
    });
  });
});

test("conflicting retry is not accepted", async () => {
  await withEnabledFlag(async () => {
    const result = await submitKioskIntakeV1(
      guest, submissionId,
      {
        authorizeRequest: async () => true,
        persist: async () => ({
          accepted: false,
          status: "idempotency_conflict"
        })
      }
    );

    assert.equal(result.accepted, false);
  });
});

test("storage failure cannot produce success receipt", async () => {
  await withEnabledFlag(async () => {
    await assert.rejects(
      () => submitKioskIntakeV1(
        guest, submissionId,
        {
          authorizeRequest: async () => true,
          persist: async () => {
            throw new Error("STORAGE_UNAVAILABLE");
          }
        }
      ),
      /STORAGE_UNAVAILABLE/
    );
  });
});