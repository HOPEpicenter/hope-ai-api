import { randomUUID } from "node:crypto";
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
    const body = (await request.json()) as {
      visitorId?: unknown;
      assignedToOwnerId?: unknown;
    };

    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";
    const assignedToOwnerId =
      typeof body.assignedToOwnerId === "string" ? body.assignedToOwnerId.trim() : "";

    if (!visitorId) {
      return NextResponse.json({ error: "Visitor ID is required." }, { status: 400 });
    }

    const baseUrl = requireEnv("HOPE_OPS_BASE_URL").replace(/\/+$/, "");
    const apiKey = requireEnv("HOPE_API_KEY");

    const upstream = await fetch(`${baseUrl}/api/formation/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        accept: "application/json"
      },
      body: JSON.stringify({
        v: 1,
        eventId: randomUUID(),
        visitorId,
        type: "FOLLOWUP_UNASSIGNED",
        occurredAt: new Date().toISOString(),
        source: {
          system: "dashboard"
        },
        data: {
          assignedToOwnerId: assignedToOwnerId || null
        }
      }),
      cache: "no-store"
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

    return NextResponse.json(
      {
        ok: true,
        visitorId
      },
      { status: upstream.status }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to unassign followup.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}



