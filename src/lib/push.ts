import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import type { Backend } from './backend';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/**
 * Ask for permission to send alerts and register this phone. Quietly does nothing on the web,
 * in demo mode, when the person says no, or before the app has an EAS project id (set by `eas init`).
 */
export async function registerForPush(backend: Backend) {
  if (Platform.OS === 'web' || backend.kind !== 'supabase') return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await backend.registerPushToken(token, Platform.OS);
  } catch {
    // Alerts are a convenience; the inbox still has everything.
  }
}

/** Tapping an alert opens the screen it is about. Returns an unsubscribe. */
export function openAlertsOnTap() {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const link = r.notification.request.content.data?.link;
    if (typeof link === 'string' && link.startsWith('/')) router.push(link as never);
  });
  return () => sub.remove();
}
