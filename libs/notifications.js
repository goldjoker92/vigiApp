// libs/notifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import messaging from '@react-native-firebase/messaging';
import { onAuthStateChanged } from 'firebase/auth';

// ====== Visuel foreground (pas de popup disruptive)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ====== Canaux Android
export async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') { return; }
  await Notifications.setNotificationChannelAsync('alerts-high', {
    name: 'Alerts — High Priority',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    sound: undefined,
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// ====== Permissions + ExpoPushToken
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) { return null; }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') { return null; }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

// ====== FCM device token natif (Firebase SDK)
export async function getFcmDeviceTokenAsync() {
  try {
    await messaging().registerDeviceForRemoteMessages();
    return await messaging().getToken();
  } catch {
    return null;
  }
}

// ====== Deep link → path expo-router
function urlToPath(u) {
  if (!u) { return null; }
  const parsed = Linking.parse(u); // { scheme, path, queryParams }
  let p = parsed?.path || '';
  if (!p) { return null; }
  // supporte vigiapp://app/public-alerts/ID
  if (p.startsWith('app/')) { p = p.replace(/^app\//, ''); }
  if (!p.startsWith('/')) { p = `/${p}`; }
  return p;
}

// file d’attente si router/ auth pas prêts
let pendingPath = null;
function tryRoute(path) {
  if (!path) { return; }
  try {
    router.push(path);
    pendingPath = null;
  } catch {
    pendingPath = path; // retente plus tard
  }
}

// ====== Navigation depuis payload
function navigateFromPayload(data) {
  const id = data?.alertId || data?.id;
  const url = data?.url;

  // priorité : /public-alerts/:id
  const canonical = id ? `/public-alerts/${id}` : null;
  const fromUrl = urlToPath(url);

  tryRoute(canonical || fromUrl);
}

export function attachNotificationListeners({
  onReceive,
  onResponse,
}) {
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    onReceive?.(n);
  });

  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    onResponse?.(r);
    const data = r?.notification?.request?.content?.data || {};
    navigateFromPayload(data);
  });

  return () => {
    try { sub1.remove(); } catch {}
    try { sub2.remove(); } catch {}
  };
}

// ====== Init (canaux + cold start depuis notif OU deep link)
export async function initNotifications() {
  await ensureAndroidChannels();

  // 1) Cas: app lancée via notif (cold start)
  const resp = await Notifications.getLastNotificationResponseAsync();
  if (resp?.notification?.request?.content?.data) {
    navigateFromPayload(resp.notification.request.content.data);
  }

  // 2) Cas: app lancée via deep link direct (ex: vigiapp://public-alerts/ID)
  const initialUrl = await Linking.getInitialURL();
  const path = urlToPath(initialUrl || undefined);
  if (path) { tryRoute(path); }
}

// ====== Auth gate: rejoue la navigation en attente quand l’user apparaît
export function wireAuthGateForNotifications(auth) {
  onAuthStateChanged(auth, () => {
    if (pendingPath) {
      const to = pendingPath;
      pendingPath = null;
      setTimeout(() => tryRoute(to), 0);
    }
  });
}
