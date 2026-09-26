import type { Request, Response } from "express";
import { CanonicalFormationProfileReader } from "../../services/formation/canonicalFormationProfileReader";

export { toFormationProfileEvent } from "../../domain/formation/toFormationProfileEvent";

export function createGetVisitorFormationProfileAdapter(
  reader = new CanonicalFormationProfileReader()
) {
  return async function getVisitorFormationProfile(req: Request, res: Response) {
    const memberId = String(req.params.id ?? "").trim();
    const requestId = (req as any).requestId as string | undefined;
    const result = await reader.readByMemberId(memberId);

    return res.json({
      ok: true,
      requestId,
      memberId,
      profile: result.profile
    });
  };
}