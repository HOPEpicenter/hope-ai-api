import { NextResponse } from "next/server";

export async function GET() {
  try {
    const opsBaseUrl = process.env.OPS_BASE_URL;

    if (!opsBaseUrl) {
      return NextResponse.json({
        recent: [],
        last24h: { formationEvents: 0, nextSteps: 0 },
      });
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const recentUrl = `${opsBaseUrl}/_ops/formation/recent-events?limit=10`;
    const last24hUrl = `${opsBaseUrl}/_ops/formation/recent-events?limit=100&since=${encodeURIComponent(since24h)}`;

    const [recentRes, last24hRes] = await Promise.all([
      fetch(recentUrl, { cache: "no-store" }),
      fetch(last24hUrl, { cache: "no-store" }),
    ]);

    if (!recentRes.ok || !last24hRes.ok) {
      throw new Error("Upstream formation fetch failed");
    }

    const recentJson = await recentRes.json();
    const last24hJson = await last24hRes.json();

    const recent = Array.isArray(recentJson) ? recentJson : recentJson.items ?? [];
    const last24h = Array.isArray(last24hJson) ? last24hJson : last24hJson.items ?? [];

    return NextResponse.json({
      recent,
      last24h: {
        formationEvents: last24h.length,
        nextSteps: last24h.filter((e: any) => e?.type === "NEXT_STEP_SELECTED").length,
      },
    });
  } catch (err) {
    console.error("[formation-overview] fallback triggered", err);

    return NextResponse.json({
      recent: [],
      last24h: {
        formationEvents: 0,
        nextSteps: 0,
      },
    });
  }
}
