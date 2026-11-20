import { createHash } from "node:crypto";

const PARTITION = "friends-family-2026-11-22";
const SYNTHETIC = Object.freeze({
  name: "Synthetic Kiosk Cleanup Test",
  email: "kiosk-cleanup@example.invalid",
  phone: "",
  visitType: "first",
  interests: ["prayer"],
  invitedBy: "",
  contactConsent: false
});
const HASH = createHash("sha256").update(JSON.stringify([
  SYNTHETIC.name,
  SYNTHETIC.email.toLowerCase(),
  SYNTHETIC.phone,
  SYNTHETIC.visitType,
  [...SYNTHETIC.interests].sort(),
  SYNTHETIC.invitedBy,
  SYNTHETIC.contactConsent
])).digest("hex");
const ALLOWED_FIELDS = new Set([
  "partitionKey", "rowKey", "payloadHash", "name", "email", "phone",
  "visitType", "interestsJson", "invitedBy", "contactConsent", "receivedAt",
  "source", "reviewStatus", "etag", "timestamp"
]);
const REQUIRED_FIELDS = [...ALLOWED_FIELDS].filter(key => key !== "timestamp");

export function isExpectedSyntheticIntakeFingerprint(value: unknown): boolean {
  return value === HASH;
}

export function matchesSyntheticIntakeRow(row: unknown, submissionId: string): boolean {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const data = row as Record<string, unknown>;
  return Object.keys(data).every(key => ALLOWED_FIELDS.has(key)) &&
    REQUIRED_FIELDS.every(key => Object.prototype.hasOwnProperty.call(data, key)) &&
    data.partitionKey === PARTITION &&
    data.rowKey === submissionId &&
    data.source === "hope_ipad_kiosk_v1" &&
    data.reviewStatus === "pending" &&
    data.name === SYNTHETIC.name &&
    data.email === SYNTHETIC.email &&
    data.phone === SYNTHETIC.phone &&
    data.visitType === SYNTHETIC.visitType &&
    data.interestsJson === JSON.stringify(SYNTHETIC.interests) &&
    data.invitedBy === SYNTHETIC.invitedBy &&
    data.contactConsent === SYNTHETIC.contactConsent &&
    data.payloadHash === HASH &&
    typeof data.receivedAt === "string" &&
    Number.isFinite(Date.parse(data.receivedAt)) &&
    typeof data.etag === "string" &&
    data.etag.length <= 1024 &&
    /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"(?![\s\S])/.test(data.etag);
}
