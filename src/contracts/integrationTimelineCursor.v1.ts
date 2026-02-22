export type IntegrationAfterV1 = {
  occurredAt: string; // ISO
  stream: "engagement" | "formation";
  eventId: string;
};

export type IntegrationTimelineCursorV1 = {
  v: 1;
  visitorId: string;
  after: IntegrationAfterV1;
};

export function encodeIntegrationCursorV1(c: IntegrationTimelineCursorV1): string {
  const json = JSON.stringify(c);
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeIntegrationCursorV1(cursor: string): IntegrationTimelineCursorV1 {
  const json = Buffer.from(cursor, "base64url").toString("utf8");
  const obj = JSON.parse(json);

  if (
    !obj ||
    obj.v !== 1 ||
    typeof obj.visitorId !== "string" ||
    !obj.after ||
    typeof obj.after.occurredAt !== "string" ||
    (obj.after.stream !== "engagement" && obj.after.stream !== "formation") ||
    typeof obj.after.eventId !== "string"
  ) {
    throw new Error("Invalid integration cursor");
  }

  return obj as IntegrationTimelineCursorV1;
}
