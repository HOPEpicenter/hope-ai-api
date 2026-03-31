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
    const limit = request.nextUrl.searchParams.get("limit")?.trim() ?? "50";
    const before = request.nextUrl.searchParams.get("before")?.trim() ?? "";

    const opsBaseUrl = getOpsBaseUrl();
    const apiKey = getRequiredEnv("HOPE_API_KEY");

    const params = new URLSearchParams();
    params.set("limit", limit);
    if (before) {
      params.set("before", before);
    }

    const upstreamUrl = `${opsBaseUrl}/timeline/unified?${params.toString()}`;
    const upstream = await requestJson(upstreamUrl, apiKey);

    return NextResponse.json(upstream.data, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unexpected dashboard unified timeline error."
      },
      { status: 500 }
    );
  }
}


