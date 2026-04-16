import { NextResponse } from "next/server";
import { getFollowups } from "@/lib/loaders/get-followups";

export async function GET() {
  try {
    const data = await getFollowups();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "FAILED_TO_LOAD_FOLLOWUPS" },
      { status: 500 }
    );
  }
}
