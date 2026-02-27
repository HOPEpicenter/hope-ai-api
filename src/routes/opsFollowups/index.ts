import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { getFormationProfilesTableClient } from "../../storage/formation/formationTables";

export const opsFollowupsRouter = Router();
opsFollowupsRouter.use(requireApiKey);

opsFollowupsRouter.get("/", async (_req, res) => {
  const table = getFormationProfilesTableClient();

  const items: any[] = [];

  for await (const p of table.listEntities<any>({})) {
    const assignedTo = String((p as any).assignedTo ?? "").trim();
    if (!assignedTo) continue;

    const hasOutcome = !!(p as any).lastFollowupOutcomeAt;
    if (hasOutcome) continue;

    const assignedAt = (p as any).lastFollowupAssignedAt ?? null;
    const contactedAt = (p as any).lastFollowupContactedAt ?? null;

    const needsFollowup =
      !contactedAt ||
      (assignedAt && contactedAt && String(assignedAt) > String(contactedAt));

    items.push({
      visitorId: String((p as any).rowKey ?? (p as any).RowKey ?? ""),
      assignedTo: { ownerType: "user", ownerId: assignedTo },
      lastFollowupAssignedAt: assignedAt,
      lastFollowupContactedAt: contactedAt,
      stage: (p as any).stage ?? null,
      needsFollowup,
    });
  }

  return res.json({ ok: true, items });
});