import { VERSION } from "./version";

export async function version(context: any, _req: any): Promise<void> {
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
