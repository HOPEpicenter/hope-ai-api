const EXECUTION_CONFIRMATION = "CREATE-HOPE-PILOT-DATA";
const SOURCE_SYSTEM = "hope-pilot-seed";
const LOCAL_BASE_URL = "http://127.0.0.1:7071/api";
const PILOT_NOTE_MARKER = "[HOPE-PILOT-MELISSA-CARTER]";

function readEnvironment(name, fallback = "") {
  const value = process.env[name];

  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function readArgument(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument ? argument.slice(prefix.length) : null;
}

function resolveMode() {
  if (process.argv.includes("--execute")) {
    return "execute";
  }

  if (process.argv.includes("--validate")) {
    return "validate";
  }

  return "preview";
}

function resolveBaseUrl() {
  const explicit =
    readArgument("--base-url") ||
    readEnvironment("HOPE_BASE_URL");

  if (explicit) {
    return normalizeBaseUrl(explicit);
  }

  if (process.argv.includes("--staging")) {
    const stagingBaseUrl =
      readEnvironment("HOPE_STAGING_BASE_URL");

    if (!stagingBaseUrl) {
      throw new Error(
        "HOPE_STAGING_BASE_URL is required when --staging is used.",
      );
    }

    return normalizeBaseUrl(stagingBaseUrl);
  }

  return LOCAL_BASE_URL;
}

function resolveApiKey() {
  const value =
    readArgument("--api-key") ||
    readEnvironment("HOPE_API_KEY") ||
    readEnvironment("API_KEY");

  if (!value) {
    throw new Error(
      "HOPE_API_KEY, API_KEY, or --api-key is required for validate and execute modes.",
    );
  }

  return value;
}

function normalizeBaseUrl(value) {
  const normalized = String(value ?? "").trim().replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("HOPE_BASE_URL is required.");
  }

  return normalized.endsWith("/api")
    ? normalized
    : `${normalized}/api`;
}

function makeEventId(scenarioKey, eventKey) {
  return `evt-pilot-${scenarioKey}-${eventKey}`;
}

async function requestJson({
  baseUrl,
  apiKey,
  method,
  path,
  body,
}) {
  const response = await fetch(`${baseUrl}/${path.replace(/^\/+/, "")}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: body === undefined
      ? undefined
      : JSON.stringify(body),
  });

  const text = await response.text();

  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {
        raw: text,
      };
    }
  }

  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  return {
    status: response.status,
    body: payload,
  };
}

async function readStaffDirectory(context) {
  const response = await requestJson({
    ...context,
    method: "GET",
    path: "staff-identities",
  });

  const items = Array.isArray(response.body?.items)
    ? response.body.items
    : [];

  return items;
}

function resolveUniqueActiveStaff(items, displayName) {
  const matches = items.filter(
    (item) =>
      String(item?.displayName ?? "").trim() === displayName &&
      String(item?.status ?? "").trim().toLowerCase() === "active",
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active Staff identity named "${displayName}", found ${matches.length}.`,
    );
  }

  return matches[0];
}

async function createOrReuseVisitor(context, scenario) {
  const response = await requestJson({
    ...context,
    method: "POST",
    path: "visitors",
    body: {
      firstName: scenario.firstName,
      lastName: scenario.lastName,
      email: scenario.email,
      phone: scenario.phone,
    },
  });

  const visitorId = String(
    response.body?.visitorId ??
    response.body?.id ??
    "",
  ).trim();

  if (!visitorId) {
    throw new Error(
      `Visitor ${scenario.key} did not return visitorId.`,
    );
  }

  return {
    visitorId,
    status: response.status,
  };
}

async function postFormationEvent(
  context,
  {
    scenarioKey,
    eventKey,
    visitorId,
    type,
    occurredAt,
    actorId,
    data,
  },
) {
  const source = {
    system: SOURCE_SYSTEM,
  };

  if (actorId) {
    source.actorId = actorId;
  }

  return requestJson({
    ...context,
    method: "POST",
    path: "formation/events",
    body: {
      v: 1,
      eventId: makeEventId(scenarioKey, eventKey),
      visitorId,
      type,
      occurredAt,
      source,
      data,
    },
  });
}

async function readVisitorNotes(
  context,
  visitorId,
) {
  const response = await requestJson({
    ...context,
    method: "GET",
    path: `visitors/${encodeURIComponent(visitorId)}/notes`,
  });

  if (Array.isArray(response.body?.items)) {
    return response.body.items;
  }

  if (Array.isArray(response.body?.notes)) {
    return response.body.notes;
  }

  if (Array.isArray(response.body)) {
    return response.body;
  }

  return [];
}

function findPilotNote(notes) {
  return notes.find((note) =>
    String(note?.text ?? "").includes(PILOT_NOTE_MARKER),
  );
}

async function createVisitorNote(
  context,
  visitorId,
  text,
) {
  return requestJson({
    ...context,
    method: "POST",
    path: `visitors/${encodeURIComponent(visitorId)}/notes`,
    body: {
      text,
      visibility: "private",
    },
  });
}

async function updateVisitorNote(
  context,
  visitorId,
  noteId,
  text,
) {
  return requestJson({
    ...context,
    method: "PATCH",
    path:
      `visitors/${encodeURIComponent(visitorId)}` +
      `/notes/${encodeURIComponent(noteId)}`,
    body: {
      text,
      visibility: "private",
      reason: "Corrected wording for Pilot training scenario",
    },
  });
}

function buildScenarios(staff = null) {
  const douglasStaffId =
    staff?.douglas?.staffId ?? "<Douglas Myrie Staff ID>";

  const jessieStaffId =
    staff?.jessie?.staffId ?? "<Jessie Blair-Myrie Staff ID>";

  return [
    {
      key: "marcus-reed",
      firstName: "Marcus",
      lastName: "Reed",
      email: "pilot.marcus.reed@hope.test",
      phone: "555-0101",
      description: "New person with no recorded ministry activity",
      events: [],
    },
    {
      key: "alicia-grant",
      firstName: "Alicia",
      lastName: "Grant",
      email: "pilot.alicia.grant@hope.test",
      phone: "555-0102",
      description: "Connected person without a selected next step",
      events: [
        {
          eventKey: "service-attended",
          type: "SERVICE_ATTENDED",
          data: {
            service: "Sunday Worship",
          },
        },
      ],
    },
    {
      key: "naomi-clarke",
      firstName: "Naomi",
      lastName: "Clarke",
      email: "pilot.naomi.clarke@hope.test",
      phone: "555-0103",
      description: "Active care assigned to Douglas Myrie",
      events: [
        {
          eventKey: "assigned",
          type: "FOLLOWUP_ASSIGNED",
          actorId: douglasStaffId,
          data: {
            assigneeId: douglasStaffId,
          },
        },
      ],
    },
    {
      key: "daniel-brooks",
      firstName: "Daniel",
      lastName: "Brooks",
      email: "pilot.daniel.brooks@hope.test",
      phone: "555-0104",
      description: "Active care assigned to Jessie Blair-Myrie",
      events: [
        {
          eventKey: "assigned",
          type: "FOLLOWUP_ASSIGNED",
          actorId: jessieStaffId,
          data: {
            assigneeId: jessieStaffId,
          },
        },
      ],
    },
    {
      key: "olivia-james",
      firstName: "Olivia",
      lastName: "James",
      email: "pilot.olivia.james@hope.test",
      phone: "555-0105",
      description: "Care needed but currently unassigned",
      events: [
        {
          eventKey: "assigned",
          type: "FOLLOWUP_ASSIGNED",
          actorId: douglasStaffId,
          data: {
            assigneeId: douglasStaffId,
          },
        },
        {
          eventKey: "unassigned",
          type: "FOLLOWUP_UNASSIGNED",
          actorId: douglasStaffId,
          data: {
            reason: "Returned to the shared care queue",
          },
        },
      ],
    },
    {
      key: "samuel-king",
      firstName: "Samuel",
      lastName: "King",
      email: "pilot.samuel.king@hope.test",
      phone: "555-0106",
      description: "Contact made; outcome still pending",
      events: [
        {
          eventKey: "assigned",
          type: "FOLLOWUP_ASSIGNED",
          actorId: douglasStaffId,
          data: {
            assigneeId: douglasStaffId,
          },
        },
        {
          eventKey: "contacted",
          type: "FOLLOWUP_CONTACTED",
          actorId: douglasStaffId,
          data: {
            method: "phone",
            result: "connected",
          },
        },
      ],
    },
    {
      key: "rachel-bennett",
      firstName: "Rachel",
      lastName: "Bennett",
      email: "pilot.rachel.bennett@hope.test",
      phone: "555-0107",
      description: "Completed care outcome",
      events: [
        {
          eventKey: "assigned",
          type: "FOLLOWUP_ASSIGNED",
          actorId: jessieStaffId,
          data: {
            assigneeId: jessieStaffId,
          },
        },
        {
          eventKey: "contacted",
          type: "FOLLOWUP_CONTACTED",
          actorId: jessieStaffId,
          data: {
            method: "text",
            result: "connected",
          },
        },
        {
          eventKey: "outcome",
          type: "FOLLOWUP_OUTCOME_RECORDED",
          actorId: jessieStaffId,
          data: {
            outcome: "connected",
            notes: "Care conversation completed",
          },
        },
      ],
    },
    {
      key: "jonathan-price",
      firstName: "Jonathan",
      lastName: "Price",
      email: "pilot.jonathan.price@hope.test",
      phone: "555-0108",
      description: "Next step selected but not completed",
      events: [
        {
          eventKey: "next-step-selected",
          type: "NEXT_STEP_SELECTED",
          actorId: douglasStaffId,
          data: {
            nextStep: "Discover HOPE",
          },
        },
      ],
    },
    {
      key: "grace-williams",
      firstName: "Grace",
      lastName: "Williams",
      email: "pilot.grace.williams@hope.test",
      phone: "555-0109",
      description: "Next step selected and completed",
      events: [
        {
          eventKey: "next-step-selected",
          type: "NEXT_STEP_SELECTED",
          actorId: jessieStaffId,
          data: {
            nextStep: "Join a Group",
          },
        },
        {
          eventKey: "next-step-completed",
          type: "NEXT_STEP_COMPLETED",
          actorId: jessieStaffId,
          data: {
            nextStep: "Join a Group",
          },
        },
      ],
    },
    {
      key: "melissa-carter",
      firstName: "Melissa",
      lastName: "Carter",
      email: "pilot.melissa.carter@hope.test",
      phone: "555-0110",
      description: "Pastoral note created and corrected",
      events: [],
      correctedNote: true,
    },
  ];
}

async function main() {
  const mode = resolveMode();
  const execute = mode === "execute";
  const confirmation = readArgument("--confirm");

  if (
    execute &&
    confirmation !== EXECUTION_CONFIRMATION
  ) {
    throw new Error(
      `Execution requires --confirm=${EXECUTION_CONFIRMATION}`,
    );
  }

  if (mode === "preview") {
    const scenarios = buildScenarios();

    console.log(
      JSON.stringify(
        {
          mode,
          destructive: false,
          networkAccess: false,
          requiredStaff: [
            "Douglas Myrie",
            "Jessie Blair-Myrie",
          ],
          scenarios: scenarios.map((scenario) => ({
            key: scenario.key,
            name: `${scenario.firstName} ${scenario.lastName}`,
            email: scenario.email,
            description: scenario.description,
            eventTypes: scenario.events.map((event) => event.type),
            correctedNote: scenario.correctedNote === true,
          })),
        },
        null,
        2,
      ),
    );

    return;
  }

  const baseUrl = resolveBaseUrl();
  const apiKey = resolveApiKey();

  const context = {
    baseUrl,
    apiKey,
  };

  const staffItems = await readStaffDirectory(context);

  const staff = {
    douglas: resolveUniqueActiveStaff(
      staffItems,
      "Douglas Myrie",
    ),
    jessie: resolveUniqueActiveStaff(
      staffItems,
      "Jessie Blair-Myrie",
    ),
  };

  const scenarios = buildScenarios(staff);

  console.log(
    JSON.stringify(
      {
        mode,
        destructive: false,
        baseUrl,
        staff: {
          douglas: {
            staffId: staff.douglas.staffId,
            displayName: staff.douglas.displayName,
          },
          jessie: {
            staffId: staff.jessie.staffId,
            displayName: staff.jessie.displayName,
          },
        },
        scenarios: scenarios.map((scenario) => ({
          key: scenario.key,
          name: `${scenario.firstName} ${scenario.lastName}`,
          email: scenario.email,
          description: scenario.description,
          eventTypes: scenario.events.map((event) => event.type),
          correctedNote: scenario.correctedNote === true,
        })),
      },
      null,
      2,
    ),
  );

  if (mode === "validate") {
    return;
  }

  const results = [];
  const baseTime = new Date(
    Date.UTC(2026, 6, 14, 12, 0, 0),
  );

  for (let scenarioIndex = 0;
    scenarioIndex < scenarios.length;
    scenarioIndex += 1) {
    const scenario = scenarios[scenarioIndex];

    const visitor = await createOrReuseVisitor(
      context,
      scenario,
    );

    const eventResults = [];

    for (let eventIndex = 0;
      eventIndex < scenario.events.length;
      eventIndex += 1) {
      const event = scenario.events[eventIndex];

      const occurredAt = new Date(
        baseTime.getTime() +
        scenarioIndex * 60_000 +
        eventIndex * 5_000,
      ).toISOString();

      const result = await postFormationEvent(
        context,
        {
          scenarioKey: scenario.key,
          visitorId: visitor.visitorId,
          occurredAt,
          ...event,
        },
      );

      eventResults.push({
        type: event.type,
        status: result.status,
      });
    }

    let noteResult = null;

    if (scenario.correctedNote) {
      const initialText =
        `${PILOT_NOTE_MARKER} ` +
        "Melissa requested prayer for her family situation.";

      const correctedText =
        `${PILOT_NOTE_MARKER} ` +
        "Melissa requested prayer for wisdom and peace for her family.";

      const existingNotes = await readVisitorNotes(
        context,
        visitor.visitorId,
      );

      const existingPilotNote = findPilotNote(existingNotes);

      if (existingPilotNote) {
        const noteId = String(
          existingPilotNote.noteId ??
          existingPilotNote.id ??
          "",
        ).trim();

        if (!noteId) {
          throw new Error(
            "Existing Pilot note did not expose noteId.",
          );
        }

        if (
          String(existingPilotNote.text ?? "").trim() ===
          correctedText
        ) {
          noteResult = {
            noteId,
            action: "reused",
            createStatus: null,
            updateStatus: null,
          };
        } else {
          const updatedNote = await updateVisitorNote(
            context,
            visitor.visitorId,
            noteId,
            correctedText,
          );

          noteResult = {
            noteId,
            action: "corrected-existing",
            createStatus: null,
            updateStatus: updatedNote.status,
          };
        }
      } else {
        const createdNote = await createVisitorNote(
          context,
          visitor.visitorId,
          initialText,
        );

        const noteId = String(
          createdNote.body?.noteId ?? "",
        ).trim();

        if (!noteId) {
          throw new Error(
            "Created Pilot note did not return noteId.",
          );
        }

        const updatedNote = await updateVisitorNote(
          context,
          visitor.visitorId,
          noteId,
          correctedText,
        );

        noteResult = {
          noteId,
          action: "created-and-corrected",
          createStatus: createdNote.status,
          updateStatus: updatedNote.status,
        };
      }
    }

    results.push({
      key: scenario.key,
      name: `${scenario.firstName} ${scenario.lastName}`,
      visitorId: visitor.visitorId,
      visitorStatus: visitor.status,
      events: eventResults,
      note: noteResult,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: "execute",
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    "Pilot data seed failed:",
    error instanceof Error
      ? error.message
      : String(error),
  );

  process.exit(1);
});
