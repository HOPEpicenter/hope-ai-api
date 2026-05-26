import { GlobalTimelineRepository } from "../../repositories/globalTimelineRepository";

export async function buildShadowDebugEnvelope(
  limit: number,
  cursor: string | undefined | null,
  items: any[]
) {
  let shadowCount: number | null = null;
  let shadowError: string | null = null;

  try {
    const repo = new GlobalTimelineRepository();

    const shadow = await repo.read(
      Math.max(1, Math.min(200, Number(limit || 50))),
      cursor ?? undefined
    );

    shadowCount = Array.isArray(shadow.items)
      ? shadow.items.length
      : 0;
  } catch (err: any) {
    shadowError = String(err?.message ?? err);
  }

  return {
    shadowEnabled: true,
    legacyCount: Array.isArray(items) ? items.length : 0,
    shadowCount,
    shadowError,
  };
}
