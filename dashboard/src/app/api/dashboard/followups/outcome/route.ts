import { NextRequest, NextResponse } from "next/server";

const OUTCOME_MAP: Record<string, string> = {
  CONNECTED: "connected",
  LEFT_VOICEMAIL: "left_message",
  NO_ANSWER: "no_response",
  NOT_INTERESTED: "closed",
  FOLLOW_UP_LATER: "needs_care"
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      visitorId?: unknown;
      outcome?: unknown;
      note?: unknown;
    };

    const visitorId = typeof body.visitorId === "string" ? body.visitorId.trim() : "";
    const outcomeKey = typeof body.outcome === "string" ? body.outcome.trim().toUpperCase() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!visitorId) {
      return NextResponse.json({ error: "visitorId is required." }, { status: 400 });
    }

    const mappedOutcome = OUTCOME_MAP[outcomeKey];
    if (!mappedOutcome) {
      return NextResponse.json({ error: "Valid outcome is required." }, { status: 400 });
    }

    const opsBaseUrl = getRequiredEnv("HOPE_OPS_BASE_URL").replace(/\/$/, "");
    const apiKey = getRequiredEnv("HOPE_API_KEY");

    const payload = {
      id: crypto.randomUUID(),
      visitorId,
      type: "FOLLOWUP_OUTCOME_RECORDED",
      occurredAt: new Date().toISOString(),
      metadata: {
        outcome: mappedOutcome,
        ...(note ? { notes: note } : {})
      }
    };

    const upstream = await fetch(`${opsBaseUrl}/api/formation/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        accept: "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const raw = await upstream.text();
    let data: unknown = null;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }

    if (!upstream.ok) {

      const fallbackMessage = `POST /api/formation/events failed with status ${upstream.status}`;

      const errorMessage =
        typeof data === "object" && data !== null && "error" in data && typeof (data as { error?: unknown }).error === "string"
          ? (data as { error: string }).error
          : fallbackMessage;

      return NextResponse.json({ error: errorMessage }, { status: upstream.status });
    }

    return NextResponse.json({
      ok: true,
      visitorId,
      eventType: "FOLLOWUP_OUTCOME_RECORDED",
      outcome: mappedOutcome
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected dashboard followup outcome error."
      },
      { status: 500 }
    );
  }
}


