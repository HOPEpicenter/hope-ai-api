import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const limit = request.nextUrl.searchParams.get("limit")?.trim() ?? "50";
    const cursor = request.nextUrl.searchParams.get("cursor")?.trim() ?? "";
    const visitorId = request.nextUrl.searchParams.get("visitorId")?.trim() ?? "";

    const opsBaseUrl = process.env.HOPE_OPS_BASE_URL;
    const apiKey = process.env.HOPE_API_KEY;

    // 🔐 SAFE FALLBACK if env missing
    if (!opsBaseUrl || !apiKey) {
      return NextResponse.json({
        ok: true,
        items: [],
        nextCursor: null
      });
    }

    const params = new URLSearchParams();
    params.set("limit", limit);

    if (cursor) params.set("cursor", cursor);
    if (visitorId) params.set("visitorId", visitorId);

    const url = `${opsBaseUrl.replace(/\/+$/, "")}/integration/timeline/global?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Upstream timeline failed: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (err) {
    console.error("[timeline-unified] fallback triggered", err);

    // 🛡️ CRITICAL: never crash the page
    return NextResponse.json({
      ok: true,
      items: [],
      nextCursor: null
    });
  }
}
