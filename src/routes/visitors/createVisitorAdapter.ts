import { Request, Response } from "express";
import { createVisitor } from "../../services/visitors/createVisitor";

export async function createVisitorAdapter(req: Request, res: Response) {
  try {
    const result = await createVisitor(req.body);

    // createVisitor returns the visitor object
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: "Internal server error", details: err?.message ?? String(err) });
  }
}