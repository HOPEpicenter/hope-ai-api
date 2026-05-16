import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import {
  getFormationEventsTableClient,
  getFormationProfilesTableClient,
} from "../../storage/formation/formationTables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { readOpsFollowupsQueue } from "../../services/followups/readOpsFollowupsQueue";

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

  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const cursorRaw = Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor;
  const assignedToFilterRaw = Array.isArray(req.query.assignedTo)
    ? req.query.assignedTo[0]
    : req.query.assignedTo;
  const visitorIdFilterRaw = Array.isArray(req.query.visitorId)
    ? req.query.visitorId[0]
    : req.query.visitorId;
  const includeResolvedRaw = Array.isArray(req.query.includeResolved)
    ? req.query.includeResolved[0]
    : req.query.includeResolved;
  const sortByRaw = Array.isArray(req.query.sortBy) ? req.query.sortBy[0] : req.query.sortBy;
  const sortDirRaw = Array.isArray(req.query.sortDir) ? req.query.sortDir[0] : req.query.sortDir;

  const parsedLimit = Number(limitRaw);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 25;

  const parsedCursor = Number(cursorRaw);
  const cursor =
    Number.isFinite(parsedCursor) && parsedCursor >= 0
      ? parsedCursor
      : 0;

  const result = await readOpsFollowupsQueue({
    eventsTable: eventsTable as any,
    profilesTable: profilesTable as any,
    limit,
    cursor,
    assignedToFilter: String(assignedToFilterRaw ?? "").trim(),
    visitorIdFilter: String(visitorIdFilterRaw ?? "").trim(),
    includeResolved: String(includeResolvedRaw ?? "").trim().toLowerCase() === "true",
    sortBy: String(sortByRaw ?? "").trim(),
    sortDir: String(sortDirRaw ?? "").trim().toLowerCase() === "asc" ? "asc" : "desc",
  });

  return res.json({
    ok: true,
    v: 1,
    ...result,
  });
});
