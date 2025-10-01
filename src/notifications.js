// src/notifications.js
// -------------------------------------------------------------
// VigiApp — Notifications (Expo + FCM)
// Objectif V1: recevoir une notif en FG/BG/kill + ouvrir la page id
// - Canaux Android: "default" (général) + "alerts-high" (MAX heads-up)
// - Handler SDK 53+ (banner + sound + list)
// - Cold start & tap → navigation (attend l’auth si besoin)
// - Expose:
//   initNotifications, attachNotificationListeners,
//   wireAuthGateForNotifications, registerForPushNotificationsAsync,
//   getFcmDeviceTokenAsync, fireLocalNow/scheduleLocalIn/cancelAll
//
// NOTE: aucun write Firestore ici. On LOG seulement.
//       L’upsert device est géré par libs/registerCurrentDevice.js
// -------------------------------------------------------------

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// IDs de canaux (doivent matcher ton backend si tu forces un channelId côté FCM)
export const DEFAULT_CHANNEL_ID = 'default';
export const ALERTS_HIGH_CHANNEL_ID = 'alerts-high';

const isAndroid = Platform.OS === 'android';
const isAndroid13Plus = isAndroid && Platform.Version >= 33;

// logs simples
const log = (...a) => console.log('[NOTIF]', ...a);
const warn = (...a) => console.warn('[NOTIF] ⚠️', ...a);

// anti double-navigation + gate d’auth
let __lastHandled = { id: undefined, ts: 0 };
let __authReady = false;
let __pendingNotifData = null;

export function wireAuthGateForNotifications(authInstance = auth) {
  try {
    onAuthStateChanged(authInstance, (u) => {
      __authReady = !!u;
      if (__authReady && __pendingNotifData) {
        tryRoutePending();
      }
    });
  } catch (e) {
    warn('wireAuthGateForNotifications error:', e?.message || e);
  }
}

function tryRoutePending() {
  if (!__authReady || !__pendingNotifData) {
    return;
  }
  const data = __pendingNotifData;
  __pendingNotifData = null;
  routeFromData(data);
}

// navigation à partir des data de la notif
function routeFromData(data = {}) {
  const alertId = String(data?.alertId || '');
  if (!alertId) {
    return;
  }

  const now = Date.now();
  if (__lastHandled.id === alertId && now - (__lastHandled.ts || 0) < 1200) {
    // anti double
    return;
  }
  __lastHandled = { id: alertId, ts: now };

  const deepLink = String(data?.deepLink || '');
  const openTarget = String(data?.openTarget || 'detail');

  try {
    if (deepLink && deepLink.startsWith('vigiapp://')) {
      // ex: vigiapp://public-alerts/123 → /public-alerts/123
      router.push(deepLink.replace('vigiapp://', '/'));
      return;
    }
  } catch {}

  if (openTarget === 'home') {
    router.push(`/(tabs)/home?fromNotif=1&alertId=${encodeURIComponent(alertId)}`);
  } else {
    router.push(`/public-alerts/${alertId}`);
  }
}

// Handler foreground: affiche bannière + son même en FG (SDK 53+)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// canaux Android
async function ensureDefaultChannel() {
  if (!isAndroid) {
    return;
  }
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Par défaut',
    description: 'Notifications générales',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

async function ensureAlertsHighChannel() {
  if (!isAndroid) {
    return;
  }

  try {
    const channels = await Notifications.getNotificationChannelsAsync?.();
    const existing = channels?.find((c) => c.id === ALERTS_HIGH_CHANNEL_ID);
    if (existing && existing.importance < Notifications.AndroidImportance.HIGH) {
      // Android ne permet pas de monter l’importance après création
      warn('canal "alerts-high" existe avec importance faible. Réinstalle l’app ou change d’ID.');
    }
  } catch {}

  await Notifications.setNotificationChannelAsync(ALERTS_HIGH_CHANNEL_ID, {
    name: 'Alertes publiques (élevé)',
    description: 'Alertes importantes et critiques',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 240, 200, 240],
    enableVibrate: true,
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

export async function ensureAndroidChannels() {
  if (!isAndroid) {
    return;
  }
  await ensureDefaultChannel();
  await ensureAlertsHighChannel();
  try {
    const list = await Notifications.getNotificationChannelsAsync?.();
    log(
      'channels:',
      list?.map((c) => ({ id: c.id, importance: c.importance })),
    );
  } catch {}
}

// permissions
async function ensureAndroid13Permission() {
  if (!isAndroid13Plus) {
    return;
  }
  try {
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    log('POST_NOTIFICATIONS:', r);
  } catch (e) {
    warn('POST_NOTIFICATIONS error:', e?.message || e);
  }
}

async function ensureBasePermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    throw new Error('Permission notifications refusée');
  }
}

// Init globale à appeler au boot de l’app
export async function initNotifications() {
  if (isAndroid) {
    await ensureAndroidChannels();       // ✅ canaux d’abord
    await ensureAndroid13Permission();   // ✅ permission Android 13+
  }
  await ensureBasePermissions();         // ✅ permission iOS/Android < 13

  // Cold start: l’app a été ouverte via une notif
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    const data = resp?.notification?.request?.content?.data;
    if (data?.alertId) {
      log('Cold start from notification → data=', data);
      if (!__authReady) {
        __pendingNotifData = data;
      } else {
        routeFromData(data);
      }
    }
  } catch {}
}

// Listeners (FG + tap)
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    try {
      const content = n?.request?.content || {};
      const d = content?.data ?? {};
      // fallback UI si une notif silencieuse arrive en FG
      if (Platform.OS === 'android' && !content?.title) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: d?.title || 'VigiApp — Alerte',
            body: d?.body || 'Nouvelle alerte',
            data: d,
            channelId: DEFAULT_CHANNEL_ID,
          },
          trigger: null,
        }).catch(() => {});
      }
      log('received (foreground):', d);
    } catch {}
    onReceive?.(n);
  });

  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    try {
      const n = r?.notification;
      const d = n?.request?.content?.data ?? {};
      log('tap response:', d);
      if (!__authReady) {
        __pendingNotifData = d;
      } else {
        routeFromData(d);
      }
    } catch {}
    onResponse?.(r);
  });

  return () => {
    try { sub1?.remove?.(); } catch {}
    try { sub2?.remove?.(); } catch {}
  };
}

// Expo Push Token (optionnel si tu utilises l’API Expo Push)
export async function registerForPushNotificationsAsync() {
  await initNotifications();
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || null;
  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const expoToken = tokenResp?.data || null;
  log('Expo push token =', expoToken);
  return expoToken;
}

// FCM device token (nécessite Dev Client / APK)
export async function getFcmDeviceTokenAsync() {
  try {
    if (!Device.isDevice) {
      log('Not a physical device → no FCM token');
      return null;
    }
    await initNotifications();
    const { data: token } = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
    log('FCM device token =', token);
    // ⚠️ Pas de save ici. L’orchestrateur s’occupe de l’upsert Firestore.
    return token ?? null;
  } catch (e) {
    warn('getFcmDeviceTokenAsync error:', e?.message || e);
    return null;
  }
}

// utilitaires de test locaux (ne passent pas par FCM)
export async function fireLocalNow(data = {}) {
  return Notifications.scheduleNotificationAsync({
    content: { title: 'VigiApp (local)', body: 'Celle-ci est locale', data },
    trigger: null,
  });
}
export async function scheduleLocalIn(seconds = 5, data = {}) {
  return Notifications.scheduleNotificationAsync({
    content: { title: 'VigiApp (local)', body: `Programmée +${seconds}s`, data },
    trigger: { seconds },
  });
}
export async function cancelAll() {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
