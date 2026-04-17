import { NextResponse } from "next/server";

function getOpsBaseUrl(): string | null {
  const value =
    process.env.HOPE_OPS_BASE_URL?.trim() ||
    process.env.OPS_BASE_URL?.trim() ||
    null;

  return value ? value.replace(/\/+$/, "") : null;
}

async function readJsonSafe(response: Response) {
  const text = await response.text();
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toItems(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

export async function GET() {
  try {
    const opsBaseUrl = getOpsBaseUrl();

    const apiKey =
      process.env.HOPE_API_KEY?.trim() ||
      process.env.OPS_API_KEY?.trim() ||
      null;

    const headers: Record<string, string> = {
      accept: "application/json",
    };

    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    if (!opsBaseUrl) {
      return NextResponse.json({
        ok: true,
        recentItems: [],
        metrics: {
          formationEvents24h: 0,
          nextStepsSelected24h: 0,
        },
      });
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const recentUrl = `${opsBaseUrl}/_ops/formation/recent-events?limit=10`;
    const last24hUrl = `${opsBaseUrl}/_ops/formation/recent-events?limit=100&since=${encodeURIComponent(since24h)}`;

    const [recentRes, last24hRes] = await Promise.all([
      fetch(recentUrl, { cache: "no-store", headers }),
      fetch(last24hUrl, { cache: "no-store", headers }),
    ]);

    if (!recentRes.ok || !last24hRes.ok) {
      throw new Error("Upstream formation fetch failed");
    }

    const [recentJson, last24hJson] = await Promise.all([
      readJsonSafe(recentRes),
      readJsonSafe(last24hRes),
    ]);

    const recent = toItems(recentJson);
    const last24h = toItems(last24hJson);

    return NextResponse.json({
      ok: true,
      recentItems: recent,
      metrics: {
        formationEvents24h: last24h.length,
        nextStepsSelected24h: last24h.filter(
          (e: any) => e?.type === "NEXT_STEP_SELECTED"
        ).length,
      },
    });
  } catch (err) {
    console.error("[formation-overview] fallback triggered", err);

    return NextResponse.json({
      ok: false,
      recentItems: [],
      metrics: {
        formationEvents24h: 0,
        nextStepsSelected24h: 0,
      },
    });
  }
}
