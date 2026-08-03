/**
 * Who owns scheduling: this device, or the server.
 *
 * Both can schedule the same reminders, and if both do the user gets every notification
 * TWICE. So exactly one is in charge at a time:
 *
 *   local mode   — the device schedules everything through expo-notifications. Works
 *                  offline, works with no account, and is the default.
 *   server mode  — the backend dispatcher sends the pushes. Required for the two-caregiver
 *                  case, because a prediction has to reach BOTH phones and a device can
 *                  only schedule for itself.
 *
 * Server mode is only entered when a push token has actually been registered — not merely
 * when synced mode is on. If permission is denied, the device is a simulator, or the token
 * upsert fails, the app stays on local scheduling and the user still gets reminders.
 * Degrading to "no reminders at all" would be far worse than a missing multi-device feature.
 */

let serverPushActive = false;

type Listener = () => void;
const listeners = new Set<Listener>();

export function isServerPushActive(): boolean {
  return serverPushActive;
}

/** Called by registerPushToken once the outcome is known. */
export function setServerPushActive(active: boolean): void {
  if (serverPushActive === active) return;
  serverPushActive = active;
  for (const l of listeners) l();
}

/**
 * Notified when ownership flips, so the notification observer can immediately cancel the
 * local schedule it had already built. Registration finishes asynchronously during session
 * bootstrap, which can land after the first reconcile has already run.
 */
export function onServerPushChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
