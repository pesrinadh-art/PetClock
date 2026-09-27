import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Tiny, safe haptic helpers. No-ops on web (react-native-web has no haptics)
 * and swallow any native error so a missing engine never breaks a tap.
 *
 *   tapFeedback()      - light tick on a primary press
 *   successFeedback()  - soft "done!" when a log/save succeeds
 */
export function tapFeedback() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successFeedback() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
