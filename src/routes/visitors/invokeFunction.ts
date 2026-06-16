import { type Request, type Response } from "express";

export type AzureFunctionHandler = (context: any, req: any) => Promise<void>;

export async function invokeFunction(
  handler: AzureFunctionHandler,
  req: Request,
  res: Response
): Promise<void> {
  const context: any = {
    log: Object.assign((...args: any[]) => console.log(...args), {
      warn: (...args: any[]) => console.warn(...args),
      error: (...args: any[]) => console.error(...args),
      info: (...args: any[]) => console.info(...args)
    }),
    res: undefined
  };

  await handler(context, req);

  const result = context.res ?? {};
  const status = Number(result.status ?? 200);
  const headers = result.headers ?? {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      res.setHeader(key, value);
    }
  }

  res.status(status).json(result.body ?? {});
}