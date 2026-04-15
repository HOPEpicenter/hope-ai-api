import { NextRequest, NextResponse } from "next/server";
import { getHopeApiKey, getHopeBaseUrl } from "@/lib/server/hope-env";

export async function POST(request: NextRequest) {
  try {
    const baseUrl = getHopeBaseUrl();
    const apiKey = getHopeApiKey();

    const body = await request.json().catch(() => ({}));

    const upstream = await fetch(`${baseUrl}/api/formation/events`, {
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
          : `POST /api/formation/events failed with status ${upstream.status}`;

      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected formation events error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

