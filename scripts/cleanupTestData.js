const { TableClient } = require("@azure/data-tables");

const EXECUTION_CONFIRMATION = "DELETE-STAGING-TEST-DATA";

function readEnvironment(name, fallback = "") {
  const value = process.env[name];

  if (value == null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function parseIdListEnvironment(name) {
  const raw = readEnvironment(name, "[]");

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be a JSON array of visitor IDs.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON array of visitor IDs.`);
  }

  return new Set(
    parsed
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  );
}

function parseKeepIds() {
  return parseIdListEnvironment("KEEP_IDS");
}

function parseTargetIds() {
  return parseIdListEnvironment("TARGET_IDS");
}

// Fail closed: a visitor ID protected by KEEP_IDS must never also be a deletion target.
function assertNoProtectedTargetOverlap(keepIds, targetIds) {
  const overlap = [...targetIds].filter((id) => keepIds.has(id));

  if (overlap.length > 0) {
    throw new Error(
      `TARGET_IDS overlaps with KEEP_IDS for: ${overlap.join(", ")}`,
    );
  }
}

function resolveDeletionDecision({ mode, entity, keepIds, targetIds }) {
  const visitorId = resolveVisitorId(mode, entity);

  if (!visitorId) {
    return { visitorId: "", candidate: false, reason: "no-visitor-id" };
  }

  // When TARGET_IDS is non-empty, only those exact visitor IDs are in scope.
  if (targetIds.size > 0 && !targetIds.has(visitorId)) {
    return { visitorId, candidate: false, reason: "not-targeted" };
  }

  if (keepIds.has(visitorId)) {
    return { visitorId, candidate: false, reason: "kept" };
  }

  const partitionKey = entityPartitionKey(entity);
  const rowKey = entityRowKey(entity);

  if (!partitionKey || !rowKey) {
    return { visitorId, candidate: false, reason: "no-keys" };
  }

  return { visitorId, candidate: true, reason: "eligible" };
}

function readArgument(name) {
  const prefix = `${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));

  return argument
    ? argument.slice(prefix.length)
    : null;
}

function entityValue(entity, camelCase, pascalCase) {
  return entity?.[camelCase] ?? entity?.[pascalCase];
}

function entityPartitionKey(entity) {
  return String(entityValue(entity, "partitionKey", "PartitionKey") ?? "");
}

function entityRowKey(entity) {
  return String(entityValue(entity, "rowKey", "RowKey") ?? "");
}

function resolveVisitorId(mode, entity) {
  const partitionKey = entityPartitionKey(entity);
  const rowKey = entityRowKey(entity);
  const explicitVisitorId = String(entity?.visitorId ?? "").trim();

  switch (mode) {
    case "visitors":
      if (partitionKey === "VISITOR") {
        return rowKey;
      }

      if (partitionKey === "EMAIL") {
        return explicitVisitorId;
      }

      return explicitVisitorId;

    case "formation-events":
    case "engagement-events":
    case "engagement-summaries":
      return explicitVisitorId || partitionKey;

    case "formation-profiles":
      return explicitVisitorId || rowKey;

    case "global-timeline":
      return explicitVisitorId;

    // Shared mode for visitor-linked event tables: explicit visitorId wins, partitionKey is the fallback.
    case "visitor-events":
      return explicitVisitorId || partitionKey;

    default:
      return explicitVisitorId;
  }
}

function resolveExecutionMode(argv, confirmationArgument, targetIds = new Set()) {
  const execute = argv.includes("--execute");

  if (execute) {
    if (targetIds.size === 0) {
      throw new Error(
        "Destructive execution requires a non-empty TARGET_IDS list.",
      );
    }

    if (confirmationArgument !== EXECUTION_CONFIRMATION) {
      throw new Error(
        `Destructive execution requires --confirm=${EXECUTION_CONFIRMATION}`,
      );
    }
  }

  return {
    execute,
    mode: execute ? "execute" : "audit",
  };
}

function isTableNotFound(error) {
  const statusCode = Number(error?.statusCode ?? error?.status ?? 0);
  const code = String(error?.code ?? "");

  return (
    statusCode === 404 ||
    code === "ResourceNotFound" ||
    code === "TableNotFound"
  );
}

function buildTableDefinitions() {
  return [
    {
      label: "Visitors",
      name: readEnvironment("VISITORS_TABLE", "Visitors"),
      mode: "visitors",
    },
    {
      label: "Formation Events",
      name: readEnvironment(
        "FORMATION_EVENTS_TABLE",
        "devFormationEvents",
      ),
      mode: "formation-events",
    },
    {
      label: "Formation Profiles",
      name: readEnvironment(
        "FORMATION_PROFILES_TABLE",
        "devFormationProfiles",
      ),
      mode: "formation-profiles",
    },
    {
      label: "Engagement Events",
      name: readEnvironment(
        "ENGAGEMENT_EVENTS_TABLE",
        "EngagementEvents",
      ),
      mode: "engagement-events",
    },
    {
      label: "Engagement Summaries",
      name: readEnvironment(
        "ENGAGEMENT_SUMMARIES_TABLE",
        "devEngagementSummaries",
      ),
      mode: "engagement-summaries",
    },
    {
      label: "Global Timeline",
      name: readEnvironment(
        "GLOBAL_TIMELINE_TABLE",
        "devGlobalTimeline",
      ),
      mode: "global-timeline",
    },
    {
      label: "Six-Week Followup Events",
      name: readEnvironment(
        "SIX_WEEK_FOLLOWUP_EVENTS_TABLE",
        "VisitorFollowupEvents",
      ),
      mode: "visitor-events",
    },
    {
      label: "Ministry Communication Events",
      name: readEnvironment(
        "MINISTRY_COMMUNICATION_EVENTS_TABLE",
        "MinistryCommunicationEvents",
      ),
      mode: "visitor-events",
    },
  ];
}

async function inspectTable({
  connectionString,
  tableDefinition,
  keepIds,
  targetIds,
  execute,
}) {
  const client = TableClient.fromConnectionString(
    connectionString,
    tableDefinition.name,
    {
      allowInsecureConnection: true,
    },
  );

  const result = {
    label: tableDefinition.label,
    tableName: tableDefinition.name,
    status: "available",
    scanned: 0,
    retained: 0,
    deletionCandidates: 0,
    deleted: 0,
    skippedWithoutVisitorId: 0,
  };

  try {
    for await (const entity of client.listEntities()) {
      result.scanned += 1;

      const decision = resolveDeletionDecision({
        mode: tableDefinition.mode,
        entity,
        keepIds,
        targetIds,
      });

      if (!decision.candidate) {
        result.retained += 1;

        if (decision.reason === "no-visitor-id" || decision.reason === "no-keys") {
          result.skippedWithoutVisitorId += 1;
        }

        continue;
      }

      const partitionKey = entityPartitionKey(entity);
      const rowKey = entityRowKey(entity);

      result.deletionCandidates += 1;

      if (execute) {
        await client.deleteEntity(partitionKey, rowKey);
        result.deleted += 1;
      }
    }
  } catch (error) {
    if (isTableNotFound(error)) {
      result.status = "missing";
      return result;
    }

    throw error;
  }

  return result;
}

async function main() {
  const connectionString =
    readEnvironment("STORAGE_CONNECTION_STRING") ||
    readEnvironment("AzureWebJobsStorage");

  if (!connectionString) {
    throw new Error(
      "Missing STORAGE_CONNECTION_STRING or AzureWebJobsStorage.",
    );
  }

  const keepIds = parseKeepIds();
  const targetIds = parseTargetIds();

  assertNoProtectedTargetOverlap(keepIds, targetIds);

  const confirmation = readArgument("--confirm");
  const { execute, mode } = resolveExecutionMode(process.argv, confirmation, targetIds);

  console.log(
    JSON.stringify(
      {
        mode,
        destructive: execute,
        targetIds: [...targetIds],
        keepIds: [...keepIds],
        staffEvents: "preserved",
        confirmationRequired: EXECUTION_CONFIRMATION,
      },
      null,
      2,
    ),
  );

  const results = [];

  for (const tableDefinition of buildTableDefinitions()) {
    const result = await inspectTable({
      connectionString,
      tableDefinition,
      keepIds,
      targetIds,
      execute,
    });

    results.push(result);
  }

  const totals = results.reduce(
    (summary, result) => ({
      scanned: summary.scanned + result.scanned,
      retained: summary.retained + result.retained,
      deletionCandidates:
        summary.deletionCandidates +
        result.deletionCandidates,
      deleted: summary.deleted + result.deleted,
    }),
    {
      scanned: 0,
      retained: 0,
      deletionCandidates: 0,
      deleted: 0,
    },
  );

  console.log(
    JSON.stringify(
      {
        mode,
        tables: results,
        totals,
        preservedTables: ["StaffEvents"],
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      "Pilot data audit failed:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    process.exit(1);
  });
}

module.exports = {
  EXECUTION_CONFIRMATION,
  parseKeepIds,
  parseTargetIds,
  assertNoProtectedTargetOverlap,
  resolveVisitorId,
  resolveDeletionDecision,
  buildTableDefinitions,
  resolveExecutionMode,
};
