import type { StaffEvent } from "../../domain/staff/projectStaffDirectory";
import {
  classifyStaffSecurityMutation
} from "../../domain/staff/classifyStaffSecurityMutation";
import type {
  StaffScopedAtomicPort,
  StaffScopedAtomicResult
} from "../../repositories/staffScopedAtomicDeactivation";
import {
  submitStaffScopedAtomicDeactivation
} from "../../repositories/staffScopedAtomicDeactivation";
import {
  submitStaffScopedAtomicMutation
} from "../../repositories/staffScopedAtomicMutation";
import {
  submitStaffScopedAtomicReactivation,
  type StaffReactivationAuthorizationPort
} from "../../repositories/staffScopedAtomicReactivation";

export type StaffLifecycleCoordinationOperation =
  | "profile_update"
  | "deactivation"
  | "pending_activation"
  | "reactivation"
  | "unsupported"
  | "disabled";

export type StaffLifecycleCoordinationResult = Readonly<{
  status: "committed" | "denied" | "uncertain";
  operation: StaffLifecycleCoordinationOperation;
  executionPermitted: false;
  retryPermitted: false;
  legacyFallbackPermitted: false;
  productionWriterFenced: false;
}>;

export interface StaffLifecycleCoordinationPorts {
  storage: StaffScopedAtomicPort;
  reactivationAuthorization?: StaffReactivationAuthorizationPort;
}

export type StaffLifecycleCoordinationOptions = Readonly<{
  enabled?: boolean;
  activationTransition?: "pending" | "reactivation";
}>;

function object(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" ||
      Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function result(
  status: StaffLifecycleCoordinationResult["status"],
  operation: StaffLifecycleCoordinationOperation
): StaffLifecycleCoordinationResult {
  return {
    status,
    operation,
    executionPermitted: false,
    retryPermitted: false,
    legacyFallbackPermitted: false,
    productionWriterFenced: false
  };
}

function validAtomicResult(value: unknown): value is StaffScopedAtomicResult {
  const decision = object(value);
  return !!decision &&
    (decision.status === "committed" ||
     decision.status === "denied" ||
     decision.status === "uncertain") &&
    decision.executionPermitted === false &&
    decision.retryPermitted === false &&
    decision.productionWriterFenced === false;
}

async function submit(
  operation: StaffLifecycleCoordinationOperation,
  action: () => Promise<unknown>
): Promise<StaffLifecycleCoordinationResult> {
  try {
    const decision = await action();
    return validAtomicResult(decision)
      ? result(decision.status, operation)
      : result("uncertain", operation);
  } catch {
    return result("uncertain", operation);
  }
}

/**
 * Default-disabled adapter for supported same-partition Staff lifecycle
 * transactions. It has no legacy append port and never falls back to one.
 * Enablement is for trusted isolated composition only, not request input.
 */
export async function coordinateStaffLifecycleEvent(
  input: unknown,
  ports: StaffLifecycleCoordinationPorts,
  options: StaffLifecycleCoordinationOptions = {}
): Promise<StaffLifecycleCoordinationResult> {
  if (options.enabled !== true) {
    return result("denied", "disabled");
  }

  const event = object(input);
  if (!event ||
      !ports ||
      !ports.storage ||
      typeof ports.storage.getEntity !== "function" ||
      typeof ports.storage.submitTransaction !== "function") {
    return result("denied", "unsupported");
  }

  const classification = classifyStaffSecurityMutation(
    input as StaffEvent
  );
  const operation = classification.kind;

  if (operation === "profile_update") {
    return submit("profile_update", () =>
      submitStaffScopedAtomicMutation(input, ports.storage, true)
    );
  }

  if (operation === "deactivation") {
    return submit("deactivation", () =>
      submitStaffScopedAtomicDeactivation(input, ports.storage, true)
    );
  }

  if (operation === "activation" &&
      options.activationTransition === "pending") {
    return submit("pending_activation", () =>
      submitStaffScopedAtomicMutation(input, ports.storage, true)
    );
  }

  const authorizationPort = ports.reactivationAuthorization;
  if (operation === "activation" &&
      options.activationTransition === "reactivation" &&
      authorizationPort) {
    return submit("reactivation", () =>
      submitStaffScopedAtomicReactivation(
        input,
        ports.storage,
        authorizationPort,
        true
      )
    );
  }

  return result("denied", "unsupported");
}
