import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function requireOrdered(
  source: string,
  fragments: readonly string[],
  description: string
): number[] {
  const positions = fragments.map(fragment => {
    const position = source.indexOf(fragment);
    assert.ok(position >= 0, `${description}: missing ${fragment}`);
    return position;
  });

  for (let index = 1; index < positions.length; index++) {
    assert.ok(
      positions[index - 1] < positions[index],
      `${description}: unexpected operation ordering`
    );
  }

  return positions;
}

function run(): void {
  const recorder = readSource(
    "src/domain/formation/recordFormationEvent.ts"
  );
  const eventsRepo = readSource(
    "src/storage/formation/formationEventsRepo.ts"
  );

  const [duplicateCheck, duplicateReturn, eventInsert, timelineAppend, profileWrite] =
    requireOrdered(
      recorder,
      [
        "for await (const existing of eventsTable.listEntities",
        "return { eventRowKey: existingRowKey || rowKey, profile };",
        "await insertFormationEvent(eventsTable, eventEntity);",
        "await globalTimelineRepo.append({",
        "await upsertFormationProfile(profilesTable, profile);"
      ],
      "formation event consistency"
    );

  assert.ok(duplicateCheck < duplicateReturn);
  assert.ok(duplicateReturn < eventInsert);
  assert.ok(eventInsert < timelineAppend);
  assert.ok(timelineAppend < profileWrite);

  const duplicateBlock = recorder.slice(duplicateCheck, eventInsert);
  assert.ok(
    !duplicateBlock.includes("await upsertFormationProfile("),
    "duplicate shortcut currently does not repair the profile"
  );

  assert.ok(
    eventsRepo.includes("return { inserted: false }"),
    "event insert conflict must expose inserted=false"
  );

  assert.ok(
    recorder.includes(
      "await insertFormationEvent(eventsTable, eventEntity);"
    ),
    "recorder must continue to expose its unexamined insert result"
  );

  assert.ok(
    !recorder.includes("const { inserted } = await insertFormationEvent("),
    "recorder currently does not inspect inserted status"
  );

  const timelineFailure = recorder.indexOf(
    'throw new Error(`globalTimeline append failed:'
  );

  assert.ok(
    timelineFailure > timelineAppend && timelineFailure < profileWrite,
    "timeline failure must propagate before profile persistence"
  );

  console.log(
    "Formation event partial-failure source contract assertions passed."
  );
}

run();