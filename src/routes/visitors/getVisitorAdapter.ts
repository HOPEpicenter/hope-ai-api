import { Request, Response } from "express";
import { getVisitorById } from "../../services/visitors/getVisitorById";

export async function getVisitorAdapter(req: Request, res: Response) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const visitor = await getVisitorById(id);
    if (!visitor) return res.status(404).json({ error: "not_found" });

    return res.status(200).json(visitor);
  } catch (err: any) {
    return res.status(500).json({ error: "Internal server error", details: err?.message ?? String(err) });
  }
}