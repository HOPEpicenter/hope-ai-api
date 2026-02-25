import { EngagementEventEnvelopeV1 } from "../../contracts/engagementEvent.v1";

export function normalizeEngagementEventEnvelopeV1(
  input: EngagementEventEnvelopeV1
): EngagementEventEnvelopeV1 {
  const out: any = { ...input };

  if (typeof out.visitorId === "string") out.visitorId = out.visitorId.trim();
  if (typeof out.type === "string") out.type = out.type.trim();

  const maybeTrim = ["who", "channel", "note", "notes", "source"];
  for (const k of maybeTrim) {
    if (typeof out[k] === "string") out[k] = out[k].trim();
  }

  if (typeof out.ts === "string") {
    const d = new Date(out.ts);
    if (!Number.isNaN(d.valueOf())) out.ts = d.toISOString();
  }

  if (out.meta != null && typeof out.meta === "object" && !Array.isArray(out.meta)) {
    out.meta = { ...out.meta };
  }

  return out as EngagementEventEnvelopeV1;
}
