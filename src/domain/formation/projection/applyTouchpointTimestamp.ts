import {
  shouldAdvanceTouchpointAt
} from "../../../functions/_shared/reconciliation";

export type TouchpointProfile = Record<string, any>;

export function applyTouchpointTimestamp(params: {
  profile: TouchpointProfile;
  field: string;
  occurredAtIso: string;
}): boolean {
  const {
    profile,
    field,
    occurredAtIso
  } = params;

  if (
    !shouldAdvanceTouchpointAt(
      profile[field],
      occurredAtIso
    )
  ) {
    return false;
  }

  profile[field] = occurredAtIso;

  return true;
}
