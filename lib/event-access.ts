import { getCurrentIdentity } from "@/lib/session";
import { getEvent, isEventOwner } from "@/lib/store";

/** 現在のイベントを所有する主催者だけに、管理操作を許可する。 */
export async function getActiveEventOwner() {
  const identity = await getCurrentIdentity();
  if (!identity || identity.role !== "admin" || !identity.eventId) return null;
  if (!(await isEventOwner({ eventId: identity.eventId, githubUsername: identity.login }))) {
    return null;
  }
  const event = await getEvent(identity.eventId);
  return event ? { identity, event } : null;
}
