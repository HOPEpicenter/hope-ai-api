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

function requestJson(urlString: string, apiKey: string): Promise<{ status: number; data: any }> {
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

export async function GET(_request: NextRequest) {
  try {
    const opsBaseUrl = getOpsBaseUrl();
    const apiKey = getRequiredEnv("HOPE_API_KEY");

    const now = new Date();
    const since24h = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();

    const recentUrl = `${opsBaseUrl}/_ops/formation/recent-events?limit=10`;
    const last24hUrl = `${opsBaseUrl}/_ops/formation/recent-events?limit=100&since=${encodeURIComponent(since24h)}`;

    const [recent, recent24h] = await Promise.all([
      requestJson(recentUrl, apiKey),
      requestJson(last24hUrl, apiKey)
    ]);

    if (recent.status >= 400) {
      return NextResponse.json(recent.data, { status: recent.status });
    }

    if (recent24h.status >= 400) {
      return NextResponse.json(recent24h.data, { status: recent24h.status });
    }

    const recentItems = Array.isArray(recent.data?.items) ? recent.data.items : [];
    const items24h = Array.isArray(recent24h.data?.items) ? recent24h.data.items : [];

    const nextSteps24h = items24h.filter((item: any) => item?.type === "NEXT_STEP_SELECTED");

    return NextResponse.json(
      {
        ok: true,
        recentItems,
        metrics: {
          formationEvents24h: items24h.length,
          nextStepsSelected24h: nextSteps24h.length
        }
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected dashboard formation overview error."
      },
      { status: 500 }
    );
  }
}
