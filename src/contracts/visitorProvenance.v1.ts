export type VisitorProvenanceClassification = "operational" | "synthetic";
export type VisitorProvenanceSource =
  | "canonical_visitor_create"
  | "canonical_visitor_upsert_create";
export type VisitorProvenanceReason =
  | "new_visitor_record"
  | "visitor_created_via_upsert";

export type VisitorProvenance = Readonly<{
  classification: VisitorProvenanceClassification;
  designatedAt: string;
  source: VisitorProvenanceSource;
  actor: Readonly<{
    type: "system";
    id: "hope-ai-api";
  }>;
  reason: VisitorProvenanceReason;
}>;

export type VisitorEffectiveClassification =
  | VisitorProvenanceClassification
  | "historical_unclassified";

export function createOperationalVisitorProvenance(
  designatedAt: string = new Date().toISOString()
): VisitorProvenance {
  if (
    !Number.isFinite(Date.parse(designatedAt)) ||
    new Date(designatedAt).toISOString() !== designatedAt
  ) {
    throw new Error("designatedAt must be a canonical UTC ISO timestamp");
  }

  const provenance: VisitorProvenance = {
    classification: "operational",
    designatedAt,
    source: "canonical_visitor_create",
    actor: {
      type: "system",
      id: "hope-ai-api"
    },
    reason: "new_visitor_record"
  };

  return Object.freeze({
    ...provenance,
    actor: Object.freeze({ ...provenance.actor })
  });
}

export function createOperationalVisitorUpsertProvenance(
  designatedAt: string = new Date().toISOString()
): VisitorProvenance {
  const provenance = createOperationalVisitorProvenance(designatedAt);
  return Object.freeze({
    ...provenance,
    source: "canonical_visitor_upsert_create",
    reason: "visitor_created_via_upsert"
  });
}

export function serializeVisitorProvenance(
  provenance: VisitorProvenance
): string {
  const serialized = JSON.stringify(provenance);
  if (!parseVisitorProvenance(serialized)) {
    throw new Error("Visitor provenance is not valid for V1 persistence");
  }
  return serialized;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every(key => Object.prototype.hasOwnProperty.call(value, key))
  );
}

export function parseVisitorProvenance(
  serialized: unknown
): VisitorProvenance | null {
  if (typeof serialized !== "string") return null;

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const actor = candidate.actor;
  if (
    !hasExactKeys(candidate, [
      "classification",
      "designatedAt",
      "source",
      "actor",
      "reason"
    ]) ||
    !actor ||
    typeof actor !== "object" ||
    Array.isArray(actor)
  ) {
    return null;
  }

  const candidateActor = actor as Record<string, unknown>;
  const designatedAt = candidate.designatedAt;
  if (
    candidate.classification !== "operational" ||
    !hasExactKeys(candidateActor, ["type", "id"]) ||
    typeof designatedAt !== "string" ||
    !Number.isFinite(Date.parse(designatedAt)) ||
    new Date(designatedAt).toISOString() !== designatedAt ||
    candidateActor.type !== "system" ||
    candidateActor.id !== "hope-ai-api" ||
    !(
      (candidate.source === "canonical_visitor_create" &&
        candidate.reason === "new_visitor_record") ||
      (candidate.source === "canonical_visitor_upsert_create" &&
        candidate.reason === "visitor_created_via_upsert")
    )
  ) {
    return null;
  }

  return Object.freeze({
    classification: candidate.classification,
    designatedAt,
    source: candidate.source,
    actor: Object.freeze({
      type: candidateActor.type,
      id: candidateActor.id
    }),
    reason: candidate.reason
  });
}

export function resolveVisitorEffectiveClassification(
  serialized: unknown
): VisitorEffectiveClassification {
  return parseVisitorProvenance(serialized)?.classification ??
    "historical_unclassified";
}
