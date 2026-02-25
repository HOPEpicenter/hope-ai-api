import { RequestHandler } from "express";

export type ValidationIssue = { path: string; message: string };
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export function validateBody<T>(validator: (input: unknown) => ValidationResult<T>): RequestHandler {
  return (req, res, next) => {
    const result = validator(req.body);
    if (!result.ok) {
      return res.status(400).json({
      ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body validation failed",
          details: result.issues.map((i: ValidationIssue) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
    }
    (req as any).validatedBody = result.value;
    next();
  };
}

export function getValidatedBody<T>(req: any): T {
  return req.validatedBody as T;
}

