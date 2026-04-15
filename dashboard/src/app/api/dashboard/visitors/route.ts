import { NextRequest, NextResponse } from "next/server";
import { getHopeApiKey, getHopeBaseUrl } from "@/lib/server/hope-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const baseUrl = getHopeBaseUrl();
    const apiKey = getHopeApiKey();

    const params = new URLSearchParams();
    params.set("limit", request.nextUrl.searchParams.get("limit")?.trim() || "200");

    const upstream = await fetch(`${baseUrl}/api/visitors?${params.toString()}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      },
      cache: "no-store"
    });

    const text = await upstream.text();
    const data = text ? JSON.parse(text) : {};

    if (!upstream.ok) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : `GET /api/visitors failed with status ${upstream.status}`;

      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected dashboard visitors error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}


export async function POST(request: NextRequest) {
  try {
    const baseUrl = getHopeBaseUrl();
    const apiKey = getHopeApiKey();

    const body = await request.json().catch(() => ({}));

    const upstream = await fetch(`${baseUrl}/api/visitors`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify(body)
    });

    const text = await upstream.text();
    const data = text ? JSON.parse(text) : {};

    if (!upstream.ok) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : `POST /api/visitors failed with status ${upstream.status}`;

      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected dashboard create visitor error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
