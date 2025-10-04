// src/notifications.js
// -------------------------------------------------------------
// VigiApp — Notifications (Expo + FCM) + ACK
// Objectif V1 : recevoir une notif en FG/BG/kill + ouvrir la page id
//
// ✅ Android channels : "default" (général) + "alerts-high" (MAX heads-up)
// ✅ Handler SDK 53+ (banner + sound + list)
// ✅ Cold start & tap → navigation (attend l’auth si besoin)
// ✅ ACK vers backend (idempotent) : "receive" et "tap"
//
// Expose (identique à avant, pas de régression) :
//   - initNotifications
//   - attachNotificationListeners
//   - wireAuthGateForNotifications
//   - registerForPushNotificationsAsync
//   - getFcmDeviceTokenAsync
//   - fireLocalNow / scheduleLocalIn / cancelAll
//
// NOTE : aucun write Firestore ici. On LOG seulement.
//        L’upsert device est géré par libs/registerCurrentDevice.js
// -------------------------------------------------------------

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// ---------------------------------------------------------------------------
// Constantes / flags
// ---------------------------------------------------------------------------
export const DEFAULT_CHANNEL_ID = 'default';
export const ALERTS_HIGH_CHANNEL_ID = 'alerts-high';

const isAndroid = Platform.OS === 'android';
const isAndroid13Plus = isAndroid && Platform.Version >= 33;

// Endpoint d’ACK (HTTP Cloud Function)
const ACK_ENDPOINT =
  'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/ackPublicAlertReceipt';

// ---------------------------------------------------------------------------
/* Logs homogènes */
// ---------------------------------------------------------------------------
const log = (...a) => console.log('[NOTIF]', ...a);
const warn = (...a) => console.warn('[NOTIF] ⚠️', ...a);

// ---------------------------------------------------------------------------
// États internes : anti doubles + gate d’auth + cache ACK
// ---------------------------------------------------------------------------
let __lastHandled = { id: undefined, ts: 0 }; // anti double navigation
let __authReady = false; // gate d’auth
let __pendingNotifData = null; // navigation différée au login
const __acked = new Set(); // Set<`${alertId}|${reason}`> anti double-ACK

// ---------------------------------------------------------------------------
// AUTH GATE : on autoroute une notif reçue au boot après auth si nécessaire
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// NAVIGATION à partir du payload data de la notification
// ---------------------------------------------------------------------------
function routeFromData(data = {}) {
  const alertId = String(data?.alertId || '');
  if (!alertId) {
    return;
  }

  const now = Date.now();
  if (__lastHandled.id === alertId && now - (__lastHandled.ts || 0) < 1200) {
    // anti double route très rapprochée
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

// ---------------------------------------------------------------------------
// Handler FG (SDK 53+) : bannière + son même en foreground
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ---------------------------------------------------------------------------
// Android channels
// ---------------------------------------------------------------------------
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
      // Android ne permet pas d’augmenter l’importance après création
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

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
async function ensureAndroid13Permission() {
  if (!isAndroid13Plus) {
    return;
  }
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
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

// ---------------------------------------------------------------------------
// INIT globale (à appeler au boot de l’app)
// ---------------------------------------------------------------------------
export async function initNotifications() {
  if (isAndroid) {
    await ensureAndroidChannels(); // ✅ canaux d’abord
    await ensureAndroid13Permission(); // ✅ permission Android 13+
  }
  await ensureBasePermissions(); // ✅ permission iOS/Android < 13

  // Cold start : l’app a été ouverte via une notif (tap implicite)
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    const data = resp?.notification?.request?.content?.data;
    if (data?.alertId) {
      log('Cold start from notification → data=', data);
      // ACK "tap" (cold start = ouverture via tap)
      ackAlertSafe(data, 'tap');
      if (!__authReady) {
        __pendingNotifData = data;
      } else {
        routeFromData(data);
      }
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Listeners (FG + tap) — avec ACKs
// ---------------------------------------------------------------------------
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  // Réception FG
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    try {
      const content = n?.request?.content || {};
      const d = content?.data ?? {};

      // Fallback UI : si notif silencieuse (sans title) en FG → afficher une locale
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

      // ACK réception
      if (d?.alertId) {
        ackAlertSafe(d, 'receive');
      }
    } catch {}
    onReceive?.(n);
  });

  // Tap (BG/kill/FG)
  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    try {
      const n = r?.notification;
      const d = n?.request?.content?.data ?? {};
      log('tap response:', d);

      // ACK tap
      if (d?.alertId) {
        ackAlertSafe(d, 'tap');
      }

      if (!__authReady) {
        __pendingNotifData = d;
      } else {
        routeFromData(d);
      }
    } catch {}
    onResponse?.(r);
  });

  return () => {
    try {
      sub1?.remove?.();
    } catch {}
    try {
      sub2?.remove?.();
    } catch {}
  };
}

// ---------------------------------------------------------------------------
// Expo Push Token (si tu utilises l’API Expo Push)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// FCM device token (nécessite Dev Client / APK)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// ACK helpers (idempotent, robustes, sans casser l’API publique)
// ---------------------------------------------------------------------------
async function ackAlert({ alertId, reason = 'receive', extra = {} }) {
  try {
    const uid = auth?.currentUser?.uid || '';
    let fcmToken = null;
    try {
      const tok = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
      fcmToken = tok?.data || null;
    } catch {}

    const body = {
      alertId,
      reason, // 'receive' | 'tap'
      userId: uid || '',
      fcmToken: fcmToken || '',
      platform: Platform.OS || 'unknown',
      ...extra, // channelId, appOpenTarget éventuels
    };

    const resp = await fetch(ACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const j = await resp.json().catch(() => ({}));
    log('ACK →', { alertId, reason, status: resp.status, ok: resp.ok, json: j });
  } catch (e) {
    warn('ACK FAIL', alertId, reason, e?.message || e);
  }
}

function ackAlertSafe(data, reason) {
  const alertId = String(data?.alertId || '');
  if (!alertId) {
    return;
  }

  const key = `${alertId}|${reason}`;
  if (__acked.has(key)) {
    return; // idempotence locale : ne renvoie pas 2× pour la même (alertId, reason)
  }
  __acked.add(key);

  const extra = {
    channelId: String(data?.channelId || ''),
    appOpenTarget: String(data?.openTarget || ''),
  };
  ackAlert({ alertId, reason, extra });
}

// ---------------------------------------------------------------------------
// Utilitaires de test locaux (ne passent pas par FCM)
// ---------------------------------------------------------------------------
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
