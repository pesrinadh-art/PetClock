import * as Notifications from 'expo-notifications';
import { ACTION, CATEGORY } from '../../shared/notificationContracts';
import { safe } from './available';

// Re-export the frozen-contract ids so call sites import them from one place. FE-3 registers
// exactly these so the SYNC-2 backend (BE-3) can emit the same category/action strings and the
// identical response handler plugs into its push loop with no rework.
export { ACTION, CATEGORY } from '../../shared/notificationContracts';

let registered = false;

/**
 * Register the OS-level action-button groups for each push category (frozen contract ids).
 *
 * Every logging action uses `opensAppToForeground: false` so a single tap logs with the app
 * closed — the flagship "phone stays in your pocket" path. Idempotent: safe to call on every
 * mount. No-op on web / when the native module is unavailable (see `safe`).
 */
export async function registerNotificationCategories(): Promise<void> {
  if (registered) return;
  const noForeground = { opensAppToForeground: false } as const;
  await safe('registerNotificationCategories', async () => {
    // break-check — the flagship: "Did Mochi go? ✅ Yes / ❌ Not yet / ⏰ Snooze".
    await Notifications.setNotificationCategoryAsync(CATEGORY.break, [
      { identifier: ACTION.yes, buttonTitle: '✅ Yes, logged it', options: noForeground },
      { identifier: ACTION.no, buttonTitle: '❌ Not yet', options: noForeground },
      { identifier: ACTION.snooze, buttonTitle: '⏰ Snooze 15 min', options: noForeground },
    ]);
    // meal-check — "Fed / Snooze".
    await Notifications.setNotificationCategoryAsync(CATEGORY.meal, [
      { identifier: ACTION.yes, buttonTitle: '✅ Fed', options: noForeground },
      { identifier: ACTION.snooze, buttonTitle: '⏰ Snooze 15 min', options: noForeground },
    ]);
    // med-check — "Given / Snooze".
    await Notifications.setNotificationCategoryAsync(CATEGORY.medication, [
      { identifier: ACTION.yes, buttonTitle: '✅ Given', options: noForeground },
      { identifier: ACTION.snooze, buttonTitle: '⏰ Snooze 15 min', options: noForeground },
    ]);
    // appt-reminder — tap-through only, no action buttons.
    await Notifications.setNotificationCategoryAsync(CATEGORY.appointment, []);
  });
  registered = true;
}
