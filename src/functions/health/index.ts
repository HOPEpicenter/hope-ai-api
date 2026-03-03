import { VERSION } from "../version/version";

export async function health(context: any, _req: any): Promise<void> {
  context.res = {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: {
      ok: true,
      service: "hope-ai-api",
      version: VERSION
    }
  };
}