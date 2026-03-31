import { NextRequest, NextResponse } from "next/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: unknown; email?: unknown };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const baseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
    const apiKey = requireEnv("HOPE_API_KEY");

    const upstream = await fetch(`${baseUrl}/visitors`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        accept: "application/json"
      },
      body: JSON.stringify({ name, email }),
      cache: "no-store"
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

    const visitorId = typeof data?.visitorId === "string" ? data.visitorId : "";

    return NextResponse.json(
      {
        ok: true,
        visitorId,
        created: upstream.status === 201,
        existing: upstream.status === 200
      },
      { status: upstream.status }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create visitor.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
