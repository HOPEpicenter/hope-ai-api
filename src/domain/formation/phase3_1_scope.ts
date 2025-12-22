// src/domain/formation/phase3_1_scope.ts
/* Phase 3.1 is locked to the Discover HOPE pilot.
   Do not add stages or event types here without explicitly expanding Phase scope. */

export const PHASE3_1 = {
  DEFAULT_STAGE: "Guest",
  MAX_METADATA_BYTES: 8_000, // guardrail: avoid dumping long notes into metadata
} as const;

/** Pilot-only stages (Discover HOPE) */
export const FormationStage = {
  Visitor: "Visitor",
  Guest: "Guest",
  Connected: "Connected",
} as const;

export type FormationStage = (typeof FormationStage)[keyof typeof FormationStage];

export function isFormationStage(value: unknown): value is FormationStage {
  return typeof value === "string" && (Object.values(FormationStage) as string[]).includes(value);
}

/** Visibility and sensitivity are privacy-handling flags, not judgments. */
export const FormationVisibility = {
  staff: "staff",
  pastoral: "pastoral",
  private: "private",
} as const;

export type FormationVisibility =
  (typeof FormationVisibility)[keyof typeof FormationVisibility];

export function isFormationVisibility(value: unknown): value is FormationVisibility {
  return typeof value === "string" && (Object.values(FormationVisibility) as string[]).includes(value);
}

export const FormationSensitivity = {
  none: "none",
  care: "care",
  high: "high",
} as const;

export type FormationSensitivity =
  (typeof FormationSensitivity)[keyof typeof FormationSensitivity];

export function isFormationSensitivity(value: unknown): value is FormationSensitivity {
  return typeof value === "string" && (Object.values(FormationSensitivity) as string[]).includes(value);
}

/** Pilot-only event types (Discover HOPE) */
export const FormationEventType = {
  SERVICE_ATTENDED: "SERVICE_ATTENDED",
  FOLLOWUP_ASSIGNED: "FOLLOWUP_ASSIGNED",
  FOLLOWUP_CONTACTED: "FOLLOWUP_CONTACTED",
  FOLLOWUP_OUTCOME_RECORDED: "FOLLOWUP_OUTCOME_RECORDED",
  NEXT_STEP_SELECTED: "NEXT_STEP_SELECTED",
  INFO_REQUESTED: "INFO_REQUESTED",
  PRAYER_REQUESTED: "PRAYER_REQUESTED",
} as const;

export type FormationEventType =
  (typeof FormationEventType)[keyof typeof FormationEventType];

export function isFormationEventType(value: unknown): value is FormationEventType {
  return typeof value === "string" && (Object.values(FormationEventType) as string[]).includes(value);
}

/** Common channels (keep small; can extend later without changing Phase scope) */
export type FormationChannel =
  | "service"
  | "web"
  | "sms"
  | "phone"
  | "email"
  | "inPerson"
  | "unknown";

/** Metadata shapes (Pilot only) */
export type ServiceAttendedMetadata = {
  serviceId?: string;
  campus?: string;
  checkInMethod?: "qr" | "manual" | "kids" | "unknown";
  withFamily?: boolean;
};

export type FollowupAssignedMetadata = {
  assigneeId: string;
  assigneeName?: string;
  reason?: "new_guest" | "prayer_request" | "info_request" | "other";
  dueAt?: string; // ISO
};

export type FollowupContactedMetadata = {
  assigneeId?: string;
  method: "text" | "call" | "email" | "in_person";
  result: "connected" | "left_message" | "no_answer" | "wrong_number" | "email_bounced";
  notes?: string; // keep short
};

export type FollowupOutcomeRecordedMetadata = {
  outcome: "connected" | "left_message" | "no_response" | "closed" | "needs_care";
  nextAction?: "call_again" | "invite_next_step" | "pastor_contact" | "none";
  nextActionDueAt?: string; // ISO
  notes?: string; // keep short
};

export type NextStepSelectedMetadata = {
  nextStep:
    | "prayer"
    | "baptism"
    | "small_group"
    | "foundations"
    | "serve"
    | "membership"
    | "salvation"
    | "counseling"
    | "youth"
    | "other";
  details?: string;
  preferredContactMethod?: "text" | "call" | "email" | "in_person" | "unknown";
};

export type InfoRequestedMetadata = {
  topic: "baptism" | "membership" | "groups" | "foundations" | "serve" | "salvation" | "youth" | "other";
  details?: string;
};

export type PrayerRequestedMetadata = {
  topic?:
    | "health"
    | "family"
    | "finances"
    | "salvation"
    | "guidance"
    | "grief"
    | "relationships"
    | "thanksgiving"
    | "other";
  shareWith?: "pastoral_only" | "prayer_team" | "staff_only";
  notes?: string; // minimal, avoid sensitive details
};

/** Union of metadata by event type */
export type FormationEventMetadataByType = {
  SERVICE_ATTENDED: ServiceAttendedMetadata;
  FOLLOWUP_ASSIGNED: FollowupAssignedMetadata;
  FOLLOWUP_CONTACTED: FollowupContactedMetadata;
  FOLLOWUP_OUTCOME_RECORDED: FollowupOutcomeRecordedMetadata;
  NEXT_STEP_SELECTED: NextStepSelectedMetadata;
  INFO_REQUESTED: InfoRequestedMetadata;
  PRAYER_REQUESTED: PrayerRequestedMetadata;
};

export type FormationEventMetadata =
  | ServiceAttendedMetadata
  | FollowupAssignedMetadata
  | FollowupContactedMetadata
  | FollowupOutcomeRecordedMetadata
  | NextStepSelectedMetadata
  | InfoRequestedMetadata
  | PrayerRequestedMetadata;

/** Normalized event input used by handlers/services */
export type FormationEventInput<T extends FormationEventType = FormationEventType> = {
  visitorId: string;
  type: T;
  occurredAt?: string; // ISO
  channel?: FormationChannel;
  visibility?: FormationVisibility;
  sensitivity?: FormationSensitivity;
  idempotencyKey?: string;
  metadata?: Partial<FormationEventMetadataByType[T]>;
  summary?: string;
};

/** Validation result helper */
export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Small helper: enforce metadata byte limit */
export function validateMetadataSize(metadata: unknown): ValidationResult {
  if (metadata == null) return { ok: true };
  try {
    const s = JSON.stringify(metadata);
    const bytes = Buffer.byteLength(s, "utf8");
    if (bytes > PHASE3_1.MAX_METADATA_BYTES) {
      return { ok: false, error: `metadata too large (${bytes} bytes)` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "metadata must be JSON-serializable" };
  }
}

/** Main validator: event type + required metadata fields (pilot only) */
export function validateFormationEvent(input: FormationEventInput): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "body required" };
  if (!input.visitorId || typeof input.visitorId !== "string") return { ok: false, error: "visitorId required" };
  if (!isFormationEventType(input.type)) return { ok: false, error: "invalid type" };

  if (input.visibility && !isFormationVisibility(input.visibility)) {
    return { ok: false, error: "invalid visibility" };
  }
  if (input.sensitivity && !isFormationSensitivity(input.sensitivity)) {
    return { ok: false, error: "invalid sensitivity" };
  }

  const sizeCheck = validateMetadataSize(input.metadata);
  if (!sizeCheck.ok) return sizeCheck;

  // Type-specific requirements
  const md: any = input.metadata ?? {};

  switch (input.type) {
    case FormationEventType.FOLLOWUP_ASSIGNED:
      if (!md.assigneeId || typeof md.assigneeId !== "string") {
        return { ok: false, error: "metadata.assigneeId required for FOLLOWUP_ASSIGNED" };
      }
      break;

    case FormationEventType.FOLLOWUP_CONTACTED:
      if (!md.method) return { ok: false, error: "metadata.method required for FOLLOWUP_CONTACTED" };
      if (!md.result) return { ok: false, error: "metadata.result required for FOLLOWUP_CONTACTED" };
      break;

    case FormationEventType.FOLLOWUP_OUTCOME_RECORDED:
      if (!md.outcome) return { ok: false, error: "metadata.outcome required for FOLLOWUP_OUTCOME_RECORDED" };
      break;

    case FormationEventType.NEXT_STEP_SELECTED:
      if (!md.nextStep) return { ok: false, error: "metadata.nextStep required for NEXT_STEP_SELECTED" };
      break;

    case FormationEventType.INFO_REQUESTED:
      if (!md.topic) return { ok: false, error: "metadata.topic required for INFO_REQUESTED" };
      break;

    case FormationEventType.PRAYER_REQUESTED:
      // notes/topic optional; privacy handled via sensitivity/visibility
      break;

    case FormationEventType.SERVICE_ATTENDED:
      // all optional
      break;

    default:
      return { ok: false, error: "unsupported type in Phase 3.1" };
  }

  return { ok: true };
}

/** Defaults helper: keeps handlers consistent */
export function applyFormationDefaults(input: FormationEventInput): Required<Pick<
  FormationEventInput,
  "visibility" | "sensitivity" | "channel"
>> {
  // Safe defaults:
  // - PRAYER_REQUESTED defaults to pastoral/care unless explicitly set otherwise
  if (input.type === FormationEventType.PRAYER_REQUESTED) {
    return {
      visibility: input.visibility ?? FormationVisibility.pastoral,
      sensitivity: input.sensitivity ?? FormationSensitivity.care,
      channel: input.channel ?? "unknown",
    };
  }

  return {
    visibility: input.visibility ?? FormationVisibility.staff,
    sensitivity: input.sensitivity ?? FormationSensitivity.none,
    channel: input.channel ?? "unknown",
  };
}
