import { requireCurrentRegistrationContactPermission } from "./requireCurrentRegistrationContactPermission";

// A known decline is not actionable; uncertainty is not an empty queue.
// The independent registration consent flag is enforced by the shared guard.
export async function mayExposeRegistrationContactWork(visitorId: string): Promise<boolean> {
  const failure = await requireCurrentRegistrationContactPermission(visitorId);
  if (!failure) return true;
  if (failure.status === 409) return false;
  throw new Error("Current registration consent could not be verified");
}
