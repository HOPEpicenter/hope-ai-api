import { VERSION } from "./version";

export default async function (context: any, _req: any): Promise<void> {
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