import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isStaffMutationFormationEventType,
  requireActiveFormationMutationActor,
  resolveFormationMutationActorAuthorization
} from "../../src/services/authorization/formationMutationActor";

type TestActor = {
  staffId: string;
  status: "active" | "inactive";
};

const mutationTypes = [
  "FOLLOWUP_ASSIGNED",
  "FOLLOWUP_UNASSIGNED",
  "FOLLOWUP_CONTACTED",
  "FOLLOWUP_OUTCOME_RECORDED",
  "NEXT_STEP_SELECTED",
  "NEXT_STEP_COMPLETED"
];

function requestWithActor(
  actorId?: string,
  asMap = false
): any {
  if (!actorId) {
    return {
      headers: asMap ? new Map() : {}
    };
  }

  return {
    headers: asMap
      ? new Map([
          ["x-hope-staff-actor-id", actorId]
        ])
      : {
          "x-hope-staff-actor-id": actorId
        }
  };
}

async function run(): Promise<void> {
  for (const type of mutationTypes) {
    assert.equal(
      isStaffMutationFormationEventType(type),
      true,
      `${type} should require canonical Staff`
    );

    await assert.rejects(
      () =>
        requireActiveFormationMutationActor(
          type,
          "",
          async () => null
        ),
      /source\.actorId is required for staff formation mutations/
    );

    await assert.rejects(
      () =>
        requireActiveFormationMutationActor(
          type,
          "missing-staff",
          async () => null
        ),
      /must reference an active staff identity/
    );

    await assert.rejects(
      () =>
        requireActiveFormationMutationActor(
          type,
          "inactive-staff",
          async (): Promise<TestActor> => ({
            staffId: "inactive-staff",
            status: "inactive"
          })
        ),
      /must reference an active staff identity/
    );

    const activeActor =
      await requireActiveFormationMutationActor(
        type,
        " active-staff ",
        async staffId => ({
          staffId,
          status: "active"
        })
      );

    assert.equal(
      activeActor?.staffId,
      "active-staff"
    );

    assert.equal(
      activeActor?.status,
      "active"
    );

    const missingHeader =
      await resolveFormationMutationActorAuthorization(
        requestWithActor(),
        type,
        "active-staff",
        async staffId => ({
          staffId,
          status: "active"
        })
      );

    assert.equal(
      missingHeader.ok,
      false
    );

    if (!missingHeader.ok) {
      assert.equal(
        missingHeader.status,
        401
      );
    }

    const missingPayloadActor =
      await resolveFormationMutationActorAuthorization(
        requestWithActor("active-staff"),
        type,
        "",
        async staffId => ({
          staffId,
          status: "active"
        })
      );

    assert.equal(
      missingPayloadActor.ok,
      false
    );

    if (!missingPayloadActor.ok) {
      assert.equal(
        missingPayloadActor.status,
        400
      );
    }

    let mismatchReaderCalls = 0;

    const mismatchedActor =
      await resolveFormationMutationActorAuthorization(
        requestWithActor("trusted-staff"),
        type,
        "different-staff",
        async staffId => {
          mismatchReaderCalls += 1;

          return {
            staffId,
            status: "active"
          };
        }
      );

    assert.equal(
      mismatchedActor.ok,
      false
    );

    if (!mismatchedActor.ok) {
      assert.equal(
        mismatchedActor.status,
        403
      );
    }

    assert.equal(
      mismatchReaderCalls,
      0,
      "mismatched body actor must fail before Staff lookup"
    );

    const missingCanonicalActor =
      await resolveFormationMutationActorAuthorization(
        requestWithActor("missing-staff"),
        type,
        "missing-staff",
        async () => null
      );

    assert.equal(
      missingCanonicalActor.ok,
      false
    );

    if (!missingCanonicalActor.ok) {
      assert.equal(
        missingCanonicalActor.status,
        403
      );
    }

    const inactiveTrustedActor =
      await resolveFormationMutationActorAuthorization(
        requestWithActor("inactive-staff"),
        type,
        "inactive-staff",
        async staffId => ({
          staffId,
          status: "inactive"
        })
      );

    assert.equal(
      inactiveTrustedActor.ok,
      false
    );

    if (!inactiveTrustedActor.ok) {
      assert.equal(
        inactiveTrustedActor.status,
        403
      );
    }

    const matchedActor =
      await resolveFormationMutationActorAuthorization(
        requestWithActor(
          " active-staff ",
          true
        ),
        type,
        " active-staff ",
        async staffId => ({
          staffId,
          status: "active"
        })
      );

    assert.equal(
      matchedActor.ok,
      true
    );

    if (matchedActor.ok) {
      assert.equal(
        matchedActor.actorId,
        "active-staff"
      );
    }
  }

  let readerCalls = 0;

  const nonStaffMutation =
    await requireActiveFormationMutationActor(
      "PRAYER_REQUESTED",
      "",
      async () => {
        readerCalls += 1;
        return null;
      }
    );

  assert.equal(
    isStaffMutationFormationEventType(
      "PRAYER_REQUESTED"
    ),
    false
  );

  assert.equal(
    nonStaffMutation,
    null
  );

  assert.equal(
    readerCalls,
    0
  );

  let trustedReaderCalls = 0;

  const nonStaffAuthorization =
    await resolveFormationMutationActorAuthorization(
      requestWithActor(),
      "PRAYER_REQUESTED",
      "",
      async () => {
        trustedReaderCalls += 1;
        return null;
      }
    );

  assert.equal(
    nonStaffAuthorization.ok,
    true
  );

  if (nonStaffAuthorization.ok) {
    assert.equal(
      nonStaffAuthorization.actorId,
      null
    );
  }

  assert.equal(
    trustedReaderCalls,
    0,
    "non-staff events must not require Staff header lookup"
  );

  const engagementSource =
    fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/functions/postEngagementEvent/index.ts"
      ),
      "utf8"
    );

  const engagementAuthIndex =
    engagementSource.indexOf(
      "await resolveFormationMutationActorAuthorization"
    );

  const engagementAppendIndex =
    engagementSource.indexOf(
      "await service.appendEvent(evt)"
    );

  assert.ok(
    engagementAuthIndex >= 0,
    "engagement trusted actor authorization should exist"
  );

  assert.ok(
    engagementAppendIndex >= 0,
    "engagement persistence call should exist"
  );

  assert.ok(
    engagementAuthIndex < engagementAppendIndex,
    "engagement trusted actor authorization must occur before persistence"
  );

  const formationSource =
    fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/functions/postFormationEvent/index.ts"
      ),
      "utf8"
    );

  const formationAuthIndex =
    formationSource.indexOf(
      "await resolveFormationMutationActorAuthorization"
    );

  const formationEnsureIndex =
    formationSource.indexOf(
      "await ensureFormationTables()"
    );

  const formationRecordIndex =
    formationSource.indexOf(
      "await recordFormationEventV1(body)"
    );

  assert.ok(
    formationAuthIndex >= 0,
    "formation trusted actor authorization should exist"
  );

  assert.ok(
    formationEnsureIndex >= 0,
    "formation table initialization call should exist"
  );

  assert.ok(
    formationRecordIndex >= 0,
    "formation persistence call should exist"
  );

  assert.ok(
    formationAuthIndex < formationEnsureIndex,
    "formation trusted actor authorization must occur before storage initialization"
  );

  assert.ok(
    formationAuthIndex < formationRecordIndex,
    "formation trusted actor authorization must occur before persistence"
  );

  console.log(
    "formationMutationActor.test.ts passed"
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});