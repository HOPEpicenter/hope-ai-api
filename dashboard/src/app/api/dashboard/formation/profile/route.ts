import { NextRequest, NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function getOpsBaseUrl(): string {
  return getRequiredEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
}

function requestJson(urlString: string, apiKey: string): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === "https:" ? https : http;

    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "accept": "application/json"
        }
      },
      (res) => {
        let raw = "";

        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const data = raw ? JSON.parse(raw) : {};
            resolve({ status: res.statusCode ?? 500, data });
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

export async function GET(request: NextRequest) {
  try {
    const visitorId = request.nextUrl.searchParams.get("visitorId")?.trim() ?? "";

    if (!visitorId) {
      return NextResponse.json({ error: "visitorId is required" }, { status: 400 });
    }

    const opsBaseUrl = getOpsBaseUrl();
    const apiKey = getRequiredEnv("HOPE_API_KEY");
    const url = `${opsBaseUrl}/visitors/${encodeURIComponent(visitorId)}/formation/profile`;

    const upstream = await requestJson(url, apiKey);

    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected dashboard formation profile error.",
        stack: error instanceof Error ? error.stack : null,
        env: {
          HOPE_OPS_BASE_URL: process.env.HOPE_OPS_BASE_URL ?? null,
          HOPE_API_KEY_SET: Boolean(process.env.HOPE_API_KEY)
        }
      },
      { status: 500 }
    );
  }
}
