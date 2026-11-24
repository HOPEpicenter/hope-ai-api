import { contactWriterHoldEnabled, CONTACT_WRITER_HOLD_MESSAGE } from "./permanentVisitorContactWriterHold";
import { requireCurrentRegistrationContactPermission } from "./requireCurrentRegistrationContactPermission";

// A known decline is not actionable; uncertainty is not an empty queue.
// The independent registration consent flag is enforced by the shared guard.
export async function mayExposeRegistrationContactWork(visitorId: string): Promise<boolean> {
  const failure = await requireCurrentRegistrationContactPermission(visitorId);
  if (!failure) return true;
  if (failure.status === 409 || (contactWriterHoldEnabled() && failure.error === CONTACT_WRITER_HOLD_MESSAGE)) return false;
  throw new Error("Current registration consent could not be verified");
}
