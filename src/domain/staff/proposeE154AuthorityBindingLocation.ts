import { normalizeEntraStaffBinding } from "./projectStaffDirectory";

/**
 * E154: proposed, non-authorizing row-location contract.
 *
 * The same Entra tenant/object identity must resolve to the same physical
 * authority row regardless of which Staff ID requests it. A per-Staff
 * partition would not enforce global binding exclusivity via one Azure Table
 * entity-group transaction. This contract does not perform any I/O, grant
 * authority, or select an operational TableClient.
 */
export const E154_AUTHORITY_PARTITION = "staff-authority-binding-v1";

export type E154AuthorityBindingLocation = Readonly<{
  partitionKey: typeof E154_AUTHORITY_PARTITION;
  rowKey: string;
  entraTenantId: string;
  entraObjectId: string;
  authoritative: false;
  storageConnectionPermitted: false;
  writePermitted: false;
  executionPermitted: false;
  retryPermitted: false;
}>;

/** Only canonical GUID pairs produce a candidate row location. */
export function proposeE154AuthorityBindingLocation(
  tenantId: unknown,
  objectId: unknown
): E154AuthorityBindingLocation | null {
  if (typeof tenantId !== "string" || typeof objectId !== "string") {
    return null;
  }
  const binding = normalizeEntraStaffBinding(tenantId, objectId);
  if (!binding) return null;
  return Object.freeze({
    partitionKey: E154_AUTHORITY_PARTITION,
    rowKey: `binding-${binding.entraTenantId}-${binding.entraObjectId}`,
    entraTenantId: binding.entraTenantId,
    entraObjectId: binding.entraObjectId,
    authoritative: false,
    storageConnectionPermitted: false,
    writePermitted: false,
    executionPermitted: false,
    retryPermitted: false
  });
}
