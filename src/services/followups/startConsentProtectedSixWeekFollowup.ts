import type { TableClient } from "@azure/data-tables";

import {
  getTableClient
} from "../../functions/_shared/tableClient";

import {
  startSixWeekVisitorFollowup,
  type StartSixWeekFollowupInput,
  type SixWeekFollowupCommandResult
} from "./sixWeekVisitorFollowupCommands";

export type RegistrationConsent =
  | "granted"
  | "declined"
  | "legacy_no_evidence"
  | "unavailable";

type ConsentRow = {
  visitorId: string;
  recordedAt: string;
  registrationDetailsJson?: string;
};

const VISITOR_ID =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const MAX_RECEIPTS = 2000;

/**
 * Read current public registration consent from canonical
 * visit receipts. Never modify receipts or expose details.
 *
 * A later explicit decision supersedes an earlier one.
 * Decline wins when timestamps are identical.
 * Unknown storage or malformed evidence fails closed.
 */
export async function readLatestRegistrationConsent(
  visitorId: string,
  table?: TableClient
): Promise<RegistrationConsent> {
  if (typeof visitorId !== "string" ||
      !VISITOR_ID.test(visitorId)) {
    return "unavailable";
  }

  try {
    const client = table ?? getTableClient("Visitors");

    const filter =
      "PartitionKey eq 'VISITOR_CHECK_IN' " +
      `and visitorId eq '${visitorId}'`;

    let count = 0;
    let latestTime = -Infinity;
    let latestConsent: boolean | undefined;

    for await (const row of client.listEntities<ConsentRow>({
      queryOptions: { filter }
    })) {
      if (++count > MAX_RECEIPTS ||
          row.partitionKey !== "VISITOR_CHECK_IN" ||
          row.visitorId !== visitorId) {
        return "unavailable";
      }

      // Existing historical check-ins may have no public
      // registration details. Do not invent a decision.
      if (row.registrationDetailsJson === undefined) {
        continue;
      }

      if (typeof row.registrationDetailsJson !== "string" ||
          row.registrationDetailsJson.length === 0 ||
          Buffer.byteLength(
            row.registrationDetailsJson, "utf8"
          ) > 8192) {
        return "unavailable";
      }

      const details: unknown = JSON.parse(
        row.registrationDetailsJson
      );

      if (!details ||
          typeof details !== "object" ||
          Array.isArray(details)) {
        return "unavailable";
      }

      const record = details as Record<string, unknown>;

      if (record.version !== 1 ||
          typeof record.contactConsent !== "boolean" ||
          typeof row.recordedAt !== "string") {
        return "unavailable";
      }

      const time = Date.parse(row.recordedAt);

      if (!Number.isFinite(time) ||
          new Date(time).toISOString() !== row.recordedAt) {
        return "unavailable";
      }

      if (time > latestTime) {
        latestTime = time;
        latestConsent = record.contactConsent;
      } else if (
        time === latestTime &&
        record.contactConsent === false
      ) {
        latestConsent = false;
      }
    }

    if (latestConsent === undefined) {
      return "legacy_no_evidence";
    }

    return latestConsent
      ? "granted"
      : "declined";
  } catch {
    return "unavailable";
  }
}

type Dependencies = {
  readConsent?: (
    visitorId: string
  ) => Promise<RegistrationConsent>;

  start?: typeof startSixWeekVisitorFollowup;
};

/**
 * Add durable registration consent enforcement without
 * replacing the existing active-Staff authorization.
 *
 * Intended for the already authenticated Staff endpoint.
 * Never invoke from public registration as a Staff actor.
 */
export async function startConsentProtectedSixWeekFollowup(
  input: StartSixWeekFollowupInput,
  deps: Dependencies = {}
): Promise<SixWeekFollowupCommandResult> {
  if (typeof input.visitorId !== "string" ||
      !VISITOR_ID.test(input.visitorId.trim())) {
    return {
      accepted: false,
      status: 400,
      error: "visitorId is required"
    };
  }

  if (input.contactConsent !== true) {
    return {
      accepted: false,
      status: 400,
      error: "Explicit follow-up consent is required"
    };
  }

  try {
    const visitorId = input.visitorId.trim();

    const consent = await (
      deps.readConsent ?? readLatestRegistrationConsent
    )(visitorId);

    if (consent === "declined") {
      return {
        accepted: false,
        status: 409,
        error: "Visitor declined follow-up permission"
      };
    }

    if (consent !== "granted" &&
        consent !== "legacy_no_evidence") {
      return {
        accepted: false,
        status: 503,
        error: "Follow-up consent could not be verified"
      };
    }

    // Legacy records retain their existing authorized
    // Staff consent workflow. Missing public evidence
    // does not itself constitute permission.
    //
    // The canonical command still checks visitor existence,
    // active Staff actor, owner and all other requirements.
    return await (
      deps.start ?? startSixWeekVisitorFollowup
    )({
      ...input,
      visitorId
    });
  } catch {
    return {
      accepted: false,
      status: 503,
      error: "Unable to verify follow-up readiness"
    };
  }
}
