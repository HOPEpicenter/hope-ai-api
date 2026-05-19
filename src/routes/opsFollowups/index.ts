import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import {
  getFormationEventsTableClient,
  getFormationProfilesTableClient,
} from "../../storage/formation/formationTables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { readCanonicalOpsFollowupsNarrative } from "../../services/followups/readCanonicalOpsFollowupsNarrative";
import { normalizeOpsFollowupsQuery } from "../../services/followups/opsFollowupsQuery";

export const opsFollowupsRouter = Router();
opsFollowupsRouter.use(requireApiKey);

opsFollowupsRouter.get("/", async (req, res) => {
  res.setHeader("X-HOPE-Surface", "ops-only");
  res.setHeader(
    "X-HOPE-Product-Use",
    "Use /api/formation/profiles for dashboard/product followup views."
  );

  const eventsTable = getFormationEventsTableClient();
  const profilesTable = getFormationProfilesTableClient();

  await ensureTableExists(eventsTable as any);
  await ensureTableExists(profilesTable as any);

  const query = normalizeOpsFollowupsQuery(req.query);

  const result = await readCanonicalOpsFollowupsNarrative({
    eventsTable: eventsTable as any,
    profilesTable: profilesTable as any,
    limit: query.limit,
    cursor: query.cursor,
    assignedToFilter: query.assignedToFilter,
    visitorIdFilter: query.visitorIdFilter,
    includeResolved: query.includeResolved,
    includeSynthetic: query.includeSynthetic,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  });

  return res.json({
    ok: true,
    v: 1,
    ...result,
  });
});
