import { NextResponse } from "next/server";
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

function formatSummary(e: any): string {
  if (!e) {
    return "Event";
  }

  if (e.type === "NEXT_STEP_SELECTED") {
    const step = e.metadata?.nextStep ?? e.metadata?.data?.nextStep;
    return step ? `Selected next step: ${step}` : "Selected a next step";
  }

  return e.summary ?? e.type ?? "Event";
}

function toTimelineItem(e: any): any {
  return {
    eventId: String(e.id ?? e.rowKey ?? Math.random()),
    occurredAt: e.occurredAt ?? null,
    stream: "formation",
    type: e.type ?? "UNKNOWN",
    summary: formatSummary(e)
  };
}

export async function GET() {
  try {
    const baseUrl = getRequiredEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
    const apiKey = getRequiredEnv("HOPE_API_KEY");

    const formation = await requestJson(
      `${baseUrl}/_ops/formation/recent-events?limit=50`,
      apiKey
    );

    if (formation.status >= 400) {
      return NextResponse.json(formation.data, { status: formation.status });
    }

    const formationItems = Array.isArray(formation.data?.items)
      ? formation.data.items.map(toTimelineItem)
      : [];

    const items = [...formationItems].sort((a, b) => {
      const ta = new Date(a.occurredAt ?? 0).getTime();
      const tb = new Date(b.occurredAt ?? 0).getTime();
      return tb - ta;
    });

    return NextResponse.json({
      ok: true,
      items,
      nextCursor: null
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Timeline error"
      },
      { status: 500 }
    );
  }
}
