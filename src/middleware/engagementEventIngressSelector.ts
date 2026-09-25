import { isPublicEngagementEventsEnabled } from "../shared/flags/isPublicEngagementEventsEnabled";
import { requireStaffIdentity } from "./requireStaffIdentity";
import { publicEngagementEventIngress } from "./publicEngagementEventIngress";

export function engagementEventIngressSelector() {
  return isPublicEngagementEventsEnabled()
    ? publicEngagementEventIngress
    : requireStaffIdentity;
}
