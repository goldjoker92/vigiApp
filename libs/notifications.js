// libs/notifications.js
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Afficher les notifs même en foreground (utile en dev)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Listener helpers
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  const sub1 = Notifications.addNotificationReceivedListener((n) => onReceive?.(n));
  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => onResponse?.(r));
  return () => {
    try {
      sub1?.remove();
    } catch {}
    try {
      sub2?.remove();
    } catch {}
  };
}

// Crée le canal Android "default" si besoin
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
  });
}

// Demande la permission et retourne le token Expo push
export async function registerForPushNotificationsAsync() {
  await ensureAndroidChannel();

  // 1) Permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    throw new Error('Permission notifications refusée');
  }

  // 2) Token Expo (projectId recommandé pour fiabilité)
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || null;

  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  return tokenResp?.data || null;
}

// Envoi d’un push via l’API Expo (token = ExponentPushToken[...])
export async function sendExpoTestPushAsync(toToken, body = 'Test') {
  const resp = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: toToken,
      title: 'VigiApp',
      body,
      data: { kind: 'test' },
      sound: 'default',
      channelId: 'default',
    }),
  });
  const json = await resp.json();
  if (!resp.ok || json?.data?.status === 'error') {
    throw new Error(json?.data?.message || JSON.stringify(json));
  }
  return json;
}

// Notifs locales (pour valider le rendu immédiat)
export async function fireLocalNow() {
  return Notifications.scheduleNotificationAsync({
    content: { title: 'VigiApp (local)', body: 'Celle-ci est locale' },
    trigger: null,
  });
}
export async function scheduleLocalIn(seconds = 5) {
  return Notifications.scheduleNotificationAsync({
    content: { title: 'VigiApp (local)', body: `Programmée +${seconds}s` },
    trigger: { seconds },
  });
}
export async function cancelAll() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
