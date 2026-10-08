import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isStaffMutationFormationEventType,
  requireActiveFormationMutationActor
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

  const engagementSource =
    fs.readFileSync(
      path.resolve(
        process.cwd(),
        "src/functions/postEngagementEvent/index.ts"
      ),
      "utf8"
    );

  const actorValidationIndex =
    engagementSource.indexOf(
      "await requireActiveFormationMutationActor"
    );

  const appendIndex =
    engagementSource.indexOf(
      "await service.appendEvent(evt)"
    );

  assert.ok(
    actorValidationIndex >= 0,
    "engagement actor validation call should exist"
  );

  assert.ok(
    appendIndex >= 0,
    "engagement persistence call should exist"
  );

  assert.ok(
    actorValidationIndex < appendIndex,
    "engagement actor validation must occur before persistence"
  );

  console.log(
    "formationMutationActor.test.ts passed"
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
