import { NextResponse } from "next/server";

function getHopeBaseUrl(): string {
  const value = process.env.HOPE_BASE_URL?.trim();
  if (!value) {
    throw new Error("Missing HOPE_BASE_URL");
  }
  return value.replace(/\/+$/, "");
}

function getApiKey(): string {
  const value = process.env.HOPE_API_KEY?.trim();
  if (!value) {
    throw new Error("Missing HOPE_API_KEY");
  }
  return value;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit")?.trim() || "20";

    const response = await fetch(
      `${getHopeBaseUrl()}/api/integration/timeline/global?limit=${encodeURIComponent(limit)}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "x-api-key": getApiKey()
        }
      }
    );

    const text = await response.text();
    const body = text ? JSON.parse(text) : { ok: false, items: [], nextCursor: null };

    return NextResponse.json(body, { status: response.status });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "FAILED_TO_LOAD_GLOBAL_TIMELINE" },
      { status: 500 }
    );
  }
}
