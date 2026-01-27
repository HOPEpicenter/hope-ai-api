import type { Request, Response } from "express";
import { createVisitor } from "../services/visitors/createVisitor";

export async function createVisitorAdapter(req: Request, res: Response) {
  try {
    const visitor = await createVisitor(req.body);
    return res.status(201).json(visitor);
  } catch (err: any) {
    // Keep it deterministic and visible while debugging
    return res.status(500).json({
      error: "Internal server error",
      message: String(err?.message ?? err)
    });
  }
}
