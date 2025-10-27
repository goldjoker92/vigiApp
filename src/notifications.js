// src/notifications.js
// ============================================================================
// VigiApp — Notifications (Expo + FCM) + ACK + Routing
// - Canaux Android: "default" (DEFAULT), "public-alerts-high" (MAX, heads-up)
//   + alias legacy "public" (MAX) pour compat (payloads existants)
// - Handler SDK 53+ (banner + list + sound en FG)
// - Cold start & tap → navigation (attend l’auth si besoin)
// - ACK idempotent (receive/tap) vers Cloud Function
// - Logs verbeux + emojis
// ============================================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid, Linking } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
export const DEFAULT_CHANNEL_ID = 'default';
export const ALERTS_HIGH_CHANNEL_ID = 'public-alerts-high'; // 👉 nouveau ID garanti MAX
const LEGACY_PUBLIC_ID = 'public'; // 👉 alias: on le crée en MAX aussi

const isAndroid = Platform.OS === 'android';
const isAndroid13Plus = isAndroid && Platform.Version >= 33;

const ACK_ENDPOINT =
  'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/ackPublicAlertReceipt';

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
const TAG = '[NOTIF]';
const log  = (...a) => console.log(`${TAG} 📣`, ...a);
const warn = (...a) => console.warn(`${TAG} ⚠️`, ...a);
const err  = (...a) => console.error(`${TAG} ❌`, ...a);

// ---------------------------------------------------------------------------
// État interne
// ---------------------------------------------------------------------------
let __authReady = false;
let __pendingNotifData = null;
let __lastHandled = { id: undefined, ts: 0 };
const __acked = new Set(); // `${alertId}|${reason}`

// ---------------------------------------------------------------------------
// Handler FG (banner/list/sound en foreground)
// ---------------------------------------------------------------------------
(() => {
  if (!globalThis.__VIGIAPP_NOTIF_HANDLER_SET__) {
    globalThis.__VIGIAPP_NOTIF_HANDLER_SET__ = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    log('Handler FG installé ✅ (banner/list/sound + compat alert)');
  }
})();

// ---------------------------------------------------------------------------
// Channels Android
// ---------------------------------------------------------------------------
async function ensureDefaultChannel() {
  if (!isAndroid) {return;}
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Par défaut',
    description: 'Notifications générales',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  log(`📦 Canal "default" prêt (importance=DEFAULT)`);
}

async function ensureMaxChannel(id, label) {
  if (!isAndroid) {return;}
  await Notifications.setNotificationChannelAsync(id, {
    name: label,
    description: 'Alertes importantes et critiques',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 500, 300, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
  log(`🚨 Canal "${id}" prêt (importance=MAX)`);
}

export async function ensureAndroidChannels() {
  if (!isAndroid) {return;}
  // On crée:
  // - default: DEFAULT
  // - public-alerts-high: MAX (nouveau)
  // - public: MAX (alias legacy, heads-up aussi)
  await ensureDefaultChannel();
  await ensureMaxChannel(ALERTS_HIGH_CHANNEL_ID, 'Alertes publiques (élevé)');
  await ensureMaxChannel(LEGACY_PUBLIC_ID, 'Alertes publiques (legacy)');

  try {
    const list = await Notifications.getNotificationChannelsAsync?.();
    log('🔎 Channels actuels →', list?.map(c => ({ id: c.id, importance: c.importance })));
  } catch (e) {
    warn('list channels:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
async function ensureAndroid13Permission() {
  if (!isAndroid13Plus) {return;}
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    log('🧿 POST_NOTIFICATIONS (Android 13+) →', r);
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
  log('✅ Permissions notifications OK');
}

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------
export function wireAuthGateForNotifications(authInstance = auth) {
  try {
    onAuthStateChanged(authInstance, (u) => {
      __authReady = !!u;
      log('🔐 Auth state →', __authReady ? 'ready ✅' : 'not-ready ⏳');
      if (__authReady && __pendingNotifData) {
        try {
          const d = __pendingNotifData;
          __pendingNotifData = null;
          routeFromData(d);
        } catch (e) {
          err('auth gate route error:', e?.message || e);
        }
      }
    });
  } catch (e) {
    err('wireAuthGateForNotifications:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
export async function initNotifications() {
  log('🧰 initNotifications() — permissions + canaux');
  if (isAndroid) {
    log('🔧 Préparation Android (channels + permission 13+)');
    await ensureAndroidChannels();
    await ensureAndroid13Permission();
  }
  await ensureBasePermissions();
  log('✅ Notifications prêtes');
}

// ---------------------------------------------------------------------------
// Cold start helper (exposé car ton layout l’utilise)
// ---------------------------------------------------------------------------
export async function checkInitialNotification(cb) {
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    if (!resp) { log('🌡️ Cold start: aucune notif initiale'); return null; }
    cb?.(resp);
    return resp;
  } catch (e) {
    warn('checkInitialNotification error:', e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function routeFromData(data = {}) {
  const alertId = String(data?.alertId || '');
  if (!alertId) {return;}

  const now = Date.now();
  if (__lastHandled.id === alertId && now - (__lastHandled.ts || 0) < 1200) {
    warn('⏱️ double route évitée (1.2s) pour', alertId);
    return;
  }
  __lastHandled = { id: alertId, ts: now };

  const rawUrl =
    data.url || data.deepLink || data.link || data.open || data.href || data.route || '';

  // Deep link vigiapp://...
  if (typeof rawUrl === 'string' && rawUrl.startsWith('vigiapp://')) {
    const path = rawUrl.replace('vigiapp://', '/');
    log('🧭 router.push (deepLink) →', path);
    router.push(path);
    return;
  }

  // Fallback par type/target
  const openTarget = String(data?.openTarget || 'detail');
  if (openTarget === 'home') {
    const path = `/(tabs)/home?fromNotif=1&alertId=${encodeURIComponent(alertId)}`;
    log('🧭 router.push →', path);
    router.push(path);
  } else {
    const path = `/public-alerts/${alertId}`;
    log('🧭 router.push →', path);
    router.push(path);
  }
}

// ---------------------------------------------------------------------------
// Listeners (FG + Tap)
// ---------------------------------------------------------------------------
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  log('👂 attachNotificationListeners()');

  // Réception FG
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    try {
      const content = n?.request?.content || {};
      const d = content?.data ?? {};
      log('📥 received(FG) → data =', d);

      // Fallback local si push silencieux sans title
      if (Platform.OS === 'android' && !content?.title) {
        const channelId = String(d?.channelId || ALERTS_HIGH_CHANNEL_ID);
        Notifications.scheduleNotificationAsync({
          content: {
            title: d?.title || 'VigiApp — Alerte',
            body: d?.body || 'Nouvelle alerte',
            data: { ...d, __localFallback: 1 },
            channelId,
          },
          trigger: null,
        })
          .then((id) => log('🧩 Fallback local schedulé (FG) id=', id, 'key=', d?.alertId || 'n/a'))
          .catch((e) => warn('fallback local notif:', e?.message || e));
      }

      if (d?.alertId) {ackAlertSafe(d, 'receive');}
    } catch (e) {
      err('received(FG) handler:', e?.message || e);
    }
    try { onReceive?.(n); } catch (e) { warn('onReceive callback error:', e?.message || e); }
  });

  // Tap (BG/kill/FG)
  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    try {
      const n = r?.notification;
      const d = n?.request?.content?.data ?? {};
      log('👆 TAP response →', d);

      if (d?.alertId) {ackAlertSafe(d, 'tap');}

      if (!__authReady) {
        __pendingNotifData = d;
        log('⛓️ auth gate: navigation différée');
      } else {
        routeFromData(d);
      }
    } catch (e) {
      err('tap handler:', e?.message || e);
    }
    try { onResponse?.(r); } catch (e) { warn('onResponse callback error:', e?.message || e); }
  });

  log('👂 Listeners attachés ✅');
  return () => {
    try { sub1?.remove?.(); log('🧹 detachNotif sub1 OK'); } catch (e) { warn('🧹 detachNotif sub1 error:', e?.message || e); }
    try { sub2?.remove?.(); log('🧹 detachNotif sub2 OK'); } catch (e) { warn('🧹 detachNotif sub2 error:', e?.message || e); }
  };
}

// ---------------------------------------------------------------------------
// Expo Push Token
// ---------------------------------------------------------------------------
export async function registerForPushNotificationsAsync() {
  await initNotifications();
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || null;
  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const expoToken = tokenResp?.data || null;
  log('🔑 Expo push token =', expoToken);
  return expoToken;
}

// ---------------------------------------------------------------------------
// FCM token (dev client / APK)
// ---------------------------------------------------------------------------
export async function getFcmDeviceTokenAsync() {
  try {
    if (!Device.isDevice) {
      log('💻 Not a physical device → no FCM token');
      return null;
    }
    await initNotifications();
    const { data: token } = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
    log('🔑 FCM device token =', token);
    return token ?? null;
  } catch (e) {
    warn('getFcmDeviceTokenAsync error:', e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ACK (idempotent)
// ---------------------------------------------------------------------------
function ackAlertSafe(data, reason) {
  const alertId = String(data?.alertId || '');
  if (!alertId) {return;}

  const key = `${alertId}|${reason}`;
  if (__acked.has(key)) {
    log('♻️ ACK ignoré (idempotent):', key);
    return;
  }
  __acked.add(key);

  const extra = {
    channelId: String(data?.channelId || ''),
    appOpenTarget: String(data?.openTarget || ''),
  };
  ackAlert({ alertId, reason, extra });
}

async function ackAlert({ alertId, reason = 'receive', extra = {} }) {
  try {
    const uid = auth?.currentUser?.uid || '';
    let fcmToken = null;
    try {
      const tok = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
      fcmToken = tok?.data || null;
    } catch (e) {
      warn('ack: getDevicePushTokenAsync:', e?.message || e);
    }

    const body = {
      alertId,
      reason,
      userId: uid || '',
      fcmToken: fcmToken || '',
      platform: Platform.OS || 'unknown',
      ...extra,
    };

    const resp = await fetch(ACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let j = {};
    try { j = await resp.json(); } catch {}
    log('📨 ACK →', { alertId, reason, status: resp.status, ok: resp.ok, json: j });
  } catch (e) {
    warn('ACK FAIL', alertId, reason, e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Tests locaux
// ---------------------------------------------------------------------------
export async function fireLocalNow(data = {}) {
  const channelId = String(data?.channelId || ALERTS_HIGH_CHANNEL_ID);
  return Notifications.scheduleNotificationAsync({
    content: { title: 'VigiApp (local)', body: 'Celle-ci est locale', data, channelId },
    trigger: null,
  });
}
export async function scheduleLocalIn(seconds = 5, data = {}) {
  const channelId = String(data?.channelId || ALERTS_HIGH_CHANNEL_ID);
  return Notifications.scheduleNotificationAsync({
    content: { title: 'VigiApp (local)', body: `Programmée +${seconds}s`, data, channelId },
    trigger: { seconds },
  });
}
export async function cancelAll() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}
