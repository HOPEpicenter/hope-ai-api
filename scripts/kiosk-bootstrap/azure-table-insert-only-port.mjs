import {
  buildReservationStorageContract,
  classifyReservationWrite
} from "./durable-reservation-protocol.mjs";

/**
 * Low-level Azure Table insert-only reservation port.
 *
 * No TableClient construction, credentials, endpoint discovery,
 * deployment wiring, or Staff creation.
 *
 * This component is storage-capable when deliberately supplied
 * a write-capable client. It is NOT an authorization gate.
 * Do not connect it to live storage without separate approval.
 */

export function createKioskInsertOnlyPort(table) {
  if (!table || typeof table.createEntity !== "function") {
    throw new TypeError("CREATE_ONLY_TABLE_PORT_REQUIRED");
  }

  const create = table.createEntity.bind(table);

  return Object.freeze({
    async insert(input) {
      const contract = buildReservationStorageContract(input);

      if (
        !contract.command ||
        contract.status !== "DESIGN_ONLY_EXECUTION_DISABLED" ||
        contract.executionPermitted !== false ||
        contract.command.intent !== "INSERT_IF_ABSENT" ||
        contract.command.operation !== "createEntity" ||
        contract.command.overwritePermitted !== false ||
        contract.command.upsertPermitted !== false ||
        contract.command.automaticRetryPermitted !== false
      ) {
        return classifyReservationWrite({ kind: "INVALID" });
      }

      // Exactly one insert attempt. Never retry automatically.
      try {
        await create({ ...contract.command.entity });
        return classifyReservationWrite({ kind: "CREATED" });
      } catch (error) {
        if (error?.statusCode === 409 ||
            error?.statusCode === 412) {
          return classifyReservationWrite({ kind: "CONFLICT" });
        }

        // Timeout, authentication failure, or any unexpected
        // result must be reconciled before further action.
        return classifyReservationWrite({ kind: "UNKNOWN" });
      }
    }
  });
}