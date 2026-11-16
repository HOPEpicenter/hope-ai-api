import {
  buildReservationStorageContract,
  reconcileReservation
} from "./durable-reservation-protocol.mjs";

/**
 * Azure Table Storage-compatible reservation adapter.
 *
 * No TableClient creation, credentials, network endpoints,
 * Azure resource configuration, or Staff writer.
 *
 * The injected dependency must expose getEntity().
 * No caller-provided option enables writes.
 */

function denied(status) {
  return Object.freeze({
    status,
    executionPermitted: false,
    reservationWritePermitted: false,
    staffCreationPermitted: false,
    authorizationGranted: false,
    automaticRetryPermitted: false,
    durableCommitVerified: false,
    crossPartitionAtomicityProven: false
  });
}

export function createKioskReservationTableAdapter(table) {
  if (!table ||
      typeof table !== "object" ||
      typeof table.getEntity !== "function") {
    throw new TypeError("READ_ONLY_TABLE_PORT_REQUIRED");
  }

  // Intentionally do not capture or invoke createEntity,
  // upsertEntity, updateEntity, or deleteEntity.
  const read = table.getEntity.bind(table);

  return Object.freeze({
    async inspect(input) {
      const contract = buildReservationStorageContract(input);

      if (!contract.command ||
          contract.executionPermitted !== false ||
          contract.command.intent !== "INSERT_IF_ABSENT") {
        return denied("INVALID_RESERVATION_PLAN");
      }

      const expected = contract.command.entity;

      let entity;
      try {
        entity = await read(
          expected.partitionKey,
          expected.rowKey
        );
      } catch (error) {
        if (error?.statusCode === 404) {
          return reconcileReservation(contract, {
            kind: "NOT_FOUND"
          });
        }
        return denied("READ_OUTCOME_UNKNOWN_RECONCILE");
      }

      return reconcileReservation(contract, {
        kind: "FOUND",
        entity
      });
    },

    async reserve() {
      return denied("WRITE_DISABLED");
    },

    async update() {
      return denied("WRITE_DISABLED");
    },

    async remove() {
      return denied("WRITE_DISABLED");
    }
  });
}