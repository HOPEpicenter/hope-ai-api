import crypto from "crypto";

/**
 * FormationEvents row-key builder, extracted unchanged from recordFormationEvent.
 * Depends only on Node's crypto; no storage, Azure, environment or other side effects.
 * This is NOT the separate algorithm in repositories/formationEventsRepository.ts.
 */

/**
 * Production writer behavior: a stable key when an event id is supplied, otherwise
 * a key with a random 12-character hex suffix.
 */
export function makeFormationEventRowKey(occurredAtIso: string, eventId?: string): string {
  // Stable RowKey when client supplies an id/idempotencyKey
  const stable = String(eventId ?? "").trim();
  if (stable) return `${occurredAtIso}__${stable}`;

  const suffix = crypto.randomBytes(6).toString("hex");
  return `${occurredAtIso}__${suffix}`;
}

/**
 * Deterministic-only variant for evidence acquisition. Never generates randomness and
 * throws on a missing or blank event id. The returned key is derived from the supplied
 * inputs only; it is not evidence that such an event was ever written.
 */
export function makeDeterministicFormationEventRowKey(
  occurredAtIso: string,
  eventId: string
): string {
  const stable = String(eventId ?? "").trim();
  if (!stable) throw new Error("eventId is required for a deterministic formation event row key");
  return `${occurredAtIso}__${stable}`;
}
