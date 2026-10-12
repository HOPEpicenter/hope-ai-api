import type { StaffEvent } from "./projectStaffDirectory";

export type StaffSecurityMutationKind =
  | "profile_update"
  | "identity_creation"
  | "binding_change"
  | "status_transition"
  | "deactivation"
  | "invitation"
  | "activation"
  | "unknown";

export type StaffSecurityMutationClassification = Readonly<{
  kind: StaffSecurityMutationKind;
  requiresCoordination: boolean;
  executionPermitted: false;
  retryPermitted: false;
}>;

/**
 * Observational classification only.
 *
 * This function does not authorize StaffEvents writes,
 * OAuth execution, retries, or external invitations.
 *
 * A profile_update classification is NOT a security
 * exemption or proof that a write is safe to commit.
 */
export function classifyStaffSecurityMutation(
  event: StaffEvent
): StaffSecurityMutationClassification {
  const data = event?.data;

  const result = (
    kind: StaffSecurityMutationKind,
    requiresCoordination: boolean
  ): StaffSecurityMutationClassification => ({
    kind,
    requiresCoordination,
    executionPermitted: false,
    retryPermitted: false
  });

  if (
    !event ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof event.staffId !== "string" ||
    !event.staffId.trim()
  ) {
    return result("unknown", true);
  }

  if (
    typeof event.eventId !== "string" ||
    !event.eventId.trim() ||
    typeof event.actorId !== "string" ||
    !event.actorId.trim() ||
    typeof event.occurredAt !== "string" ||
    !event.occurredAt.trim()
  ) {
    return result("unknown", true);
  }

  switch (event.type) {
    case "staff.created":
      return result("identity_creation", true);

    case "staff.invited":
      return result("invitation", true);

    case "staff.activated":
      return result("activation", true);

    case "staff.deactivated":
      return result("deactivation", true);

    case "staff.updated": {
      if (
        Object.prototype.hasOwnProperty.call(
          data,
          "entraTenantId"
        ) ||
        Object.prototype.hasOwnProperty.call(
          data,
          "entraObjectId"
        )
      ) {
        return result("binding_change", true);
      }

      if (
        Object.prototype.hasOwnProperty.call(
          data,
          "status"
        )
      ) {
        return result("status_transition", true);
      }

      const allowedProfileFields = new Set([
        "displayName",
        "roleLabel",
        "reason",
        "email",
        "phone",
        "ministryAreaId"
      ]);

      const fields = Object.keys(data);

      if (
        fields.length === 0 ||
        fields.some(field => !allowedProfileFields.has(field))
      ) {
        return result("unknown", true);
      }

      const validProfileValue = (
        field: string,
        value: unknown
      ): boolean => {
        if (value === null) {
          return field !== "displayName";
        }

        if (typeof value !== "string") {
          return false;
        }

        return field !== "displayName" || Boolean(value.trim());
      };

      if (
        fields.some(field =>
          !validProfileValue(
            field,
            data[field as keyof typeof data]
          )
        )
      ) {
        return result("unknown", true);
      }

      return result("profile_update", false);
    }

    default:
      return result("unknown", true);
  }
}