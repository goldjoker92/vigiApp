// -------------------------------------------------------------
// VigiApp — Notifications (Expo + FCM) + ACK + Missing routing
// -------------------------------------------------------------
// Objectif :
//   - Recevoir une notif en FG/BG/kill
//   - Ouvrir l’écran correspondant (public-alerts / missing-public-alerts)
//   - Gérer la permission + canaux Android
//   - Envoyer des ACK "receive" et "tap" (idempotent, avec logs)
//   - Ne PAS écrire Firestore ici (orchestrateur séparé)
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

// Endpoint d’ACK (public) — si votre backend Missing a un autre endpoint,
// vous pouvez en ajouter un second plus tard.
const ACK_ENDPOINT =
  'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/ackPublicAlertReceipt';

// ---------------------------------------------------------------------------
// Logs homogènes
// ---------------------------------------------------------------------------
const tag = '[NOTIF]';
const log = (...a) => console.log(tag, ...a);
const warn = (...a) => console.warn(`${tag} ⚠️`, ...a);
const err = (...a) => console.error(`${tag} ❌`, ...a);

// ---------------------------------------------------------------------------
// États internes : anti doubles + gate d’auth + cache ACK
// ---------------------------------------------------------------------------
let __lastHandled = { id: undefined, ts: 0 }; // anti double navigation rapprochée
let __authReady = false;                       // gate d’auth
let __pendingNotifData = null;                 // navigation différée au login
const __acked = new Set();                     // Set<`${key}|${reason}`>

// ---------------------------------------------------------------------------
// AUTH GATE : autoroute une notif reçue au boot après auth si nécessaire
// ---------------------------------------------------------------------------
export function wireAuthGateForNotifications(authInstance = auth) {
  try {
    onAuthStateChanged(authInstance, (u) => {
      __authReady = !!u;
      log('auth state →', __authReady ? 'ready' : 'not-ready');
      if (__authReady && __pendingNotifData) {
        try {
          tryRoutePending();
        } catch (e) {
          err('tryRoutePending failed:', e?.message || e);
        }
      }
    });
  } catch (e) {
    err('wireAuthGateForNotifications:', e?.message || e);
  }
}

function tryRoutePending() {
  if (!__authReady || !__pendingNotifData) return;
  const data = __pendingNotifData;
  __pendingNotifData = null;
  routeFromData(data);
}

// ---------------------------------------------------------------------------
// Helpers de parsing & routing
// ---------------------------------------------------------------------------
function routeFromDeepLink(dl) {
  try {
    if (!dl || typeof dl !== 'string') return null;
    if (!dl.startsWith('vigiapp://')) return null;

    // vigiapp://missing/<id>
    const mMissing = dl.match(/^vigiapp:\/\/missing\/([^/?#]+)/i);
    if (mMissing?.[1]) {
      return { path: `/missing-public-alerts/${mMissing[1]}` };
    }

    // vigiapp://public-alerts/<id>
    const mPublic = dl.match(/^vigiapp:\/\/public-alerts\/([^/?#]+)/i);
    if (mPublic?.[1]) {
      return { path: `/public-alerts/${mPublic[1]}` };
    }
  } catch (e) {
    warn('routeFromDeepLink error:', e?.message || e);
  }
  return null;
}

function routeFromData(data = {}) {
  // 1) Missing en priorité si présent
  const type = String(data?.type || '');
  const caseId = String(data?.caseId || '');
  if (type === 'missing' && caseId) {
    const now = Date.now();
    if (__lastHandled.id === `missing:${caseId}` && now - (__lastHandled.ts || 0) < 1200) {
      log('skip double route (missing)', caseId);
      return;
    }
    __lastHandled = { id: `missing:${caseId}`, ts: now };
    log('route → missing-public-alerts/', caseId);
    try {
      const dl = String(data?.deepLink || '');
      const byDl = routeFromDeepLink(dl);
      if (byDl?.path) {
        router.push(byDl.path);
        return;
      }
    } catch (e) {
      warn('deepLink handling (missing):', e?.message || e);
    }
    router.push(`/missing-public-alerts/${caseId}`);
    return;
  }

  // 2) Public alert (héritage)
  const alertId = String(data?.alertId || '');
  if (alertId) {
    const now = Date.now();
    if (__lastHandled.id === `public:${alertId}` && now - (__lastHandled.ts || 0) < 1200) {
      log('skip double route (public)', alertId);
      return;
    }
    __lastHandled = { id: `public:${alertId}`, ts: now };

    const deepLink = String(data?.deepLink || '');
    const openTarget = String(data?.openTarget || 'detail');

    try {
      const byDl = routeFromDeepLink(deepLink);
      if (byDl?.path) {
        log('route via deepLink →', byDl.path);
        router.push(byDl.path);
        return;
      }
    } catch (e) {
      warn('deepLink handling (public):', e?.message || e);
    }

    if (openTarget === 'home') {
      const path = `/(tabs)/home?fromNotif=1&alertId=${encodeURIComponent(alertId)}`;
      log('route →', path);
      router.push(path);
    } else {
      const path = `/public-alerts/${alertId}`;
      log('route →', path);
      router.push(path);
    }
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
  if (!isAndroid) return;
  try {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: 'Par défaut',
      description: 'Notifications générales',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  } catch (e) {
    err('ensureDefaultChannel:', e?.message || e);
  }
}

async function ensureAlertsHighChannel() {
  if (!isAndroid) return;
  try {
    const channels = await Notifications.getNotificationChannelsAsync?.();
    const existing = channels?.find((c) => c.id === ALERTS_HIGH_CHANNEL_ID);
    if (existing && existing.importance < Notifications.AndroidImportance.HIGH) {
      // Android ne permet pas d’augmenter l’importance après création
      warn('canal "alerts-high" existe trop faible. Réinstalle l’app ou change d’ID.');
    }
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
  } catch (e) {
    err('ensureAlertsHighChannel:', e?.message || e);
  }
}

export async function ensureAndroidChannels() {
  if (!isAndroid) return;
  await ensureDefaultChannel();
  await ensureAlertsHighChannel();
  try {
    const list = await Notifications.getNotificationChannelsAsync?.();
    log('channels:', list?.map((c) => ({ id: c.id, importance: c.importance })));
  } catch (e) {
    warn('list channels:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
async function ensureAndroid13Permission() {
  if (!isAndroid13Plus) return;
  try {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    log('POST_NOTIFICATIONS:', r);
  } catch (e) {
    warn('POST_NOTIFICATIONS error:', e?.message || e);
  }
}

async function ensureBasePermissions() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      throw new Error('Permission notifications refusée');
    }
  } catch (e) {
    // On log l’erreur et on relance pour que l’appelant sache que l’init a échoué
    err('ensureBasePermissions:', e?.message || e);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// INIT globale (à appeler au boot de l’app)
// ---------------------------------------------------------------------------
export async function initNotifications() {
  try {
    if (isAndroid) {
      await ensureAndroidChannels();       // canaux d’abord
      await ensureAndroid13Permission();   // Android 13+
    }
    await ensureBasePermissions();         // iOS / Android < 13

    // Cold start : l’app a été ouverte via une notif (tap implicite)
    try {
      const resp = await Notifications.getLastNotificationResponseAsync();
      const data = resp?.notification?.request?.content?.data;
      const hasMissing = data?.type === 'missing' && !!data?.caseId;
      const hasPublic = !!data?.alertId;

      if (hasMissing || hasPublic) {
        log('Cold start from notification → data=', data);
        // ACK "tap" (cold start = ouverture via tap)
        ackAlertSafe(data, 'tap');
        if (!__authReady) {
          __pendingNotifData = data;
        } else {
          routeFromData(data);
        }
      }
    } catch (e) {
      warn('cold start check:', e?.message || e);
    }
  } catch (e) {
    err('initNotifications:', e?.message || e);
    // On ne throw pas forcément ici pour ne pas bloquer tout le boot,
    // mais on propage quand même si l’appelant veut gérer.
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Listeners (FG + tap) — avec ACKs et logs d’erreur
// ---------------------------------------------------------------------------
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  let sub1, sub2;

  try {
    // Réception FG
    sub1 = Notifications.addNotificationReceivedListener((n) => {
      try {
        const content = n?.request?.content || {};
        const d = content?.data ?? {};

        // Fallback UI : si notif silencieuse (sans title) en FG → locale
        try {
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
        } catch (e) {
          warn('fallback local notif:', e?.message || e);
        }

        log('received (foreground):', d);

        // ACK réception (public ou missing)
        ackAlertSafe(d, 'receive');
      } catch (e) {
        err('received(FG) handler:', e?.message || e);
      }
      try {
        onReceive?.(n);
      } catch (e) {
        warn('onReceive callback error:', e?.message || e);
      }
    });

    // Tap (BG/kill/FG)
    sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
      try {
        const n = r?.notification;
        const d = n?.request?.content?.data ?? {};
        log('tap response:', d);

        ackAlertSafe(d, 'tap');

        if (!__authReady) {
          __pendingNotifData = d;
        } else {
          routeFromData(d);
        }
      } catch (e) {
        err('tap handler:', e?.message || e);
      }
      try {
        onResponse?.(r);
      } catch (e) {
        warn('onResponse callback error:', e?.message || e);
      }
    });
  } catch (e) {
    err('attachNotificationListeners:', e?.message || e);
  }

  // Unsubscribe
  return () => {
    try { sub1?.remove?.(); } catch (e) { warn('unsub sub1:', e?.message || e); }
    try { sub2?.remove?.(); } catch (e) { warn('unsub sub2:', e?.message || e); }
  };
}

// ---------------------------------------------------------------------------
// Expo Push Token (si tu utilises l’API Expo Push)
// ---------------------------------------------------------------------------
export async function registerForPushNotificationsAsync() {
  try {
    await initNotifications();
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || null;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const expoToken = tokenResp?.data || null;
    log('Expo push token =', expoToken);
    return expoToken;
  } catch (e) {
    err('registerForPushNotificationsAsync:', e?.message || e);
    return null;
  }
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
    return token ?? null;
  } catch (e) {
    warn('getFcmDeviceTokenAsync error:', e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ACK helpers (idempotent, robustes)
// ---------------------------------------------------------------------------
function computeAckKey(data, reason) {
  // Différencie public vs missing pour l’idempotence locale
  const type = String(data?.type || '');
  if (type === 'missing' && data?.caseId) return `missing:${data.caseId}|${reason}`;
  if (data?.alertId) return `public:${data.alertId}|${reason}`;
  return null;
}

async function ackAlert({ kind, id, reason = 'receive', extra = {} }) {
  try {
    const uid = auth?.currentUser?.uid || '';
    let fcmToken = null;
    try {
      const tok = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
      fcmToken = tok?.data || null;
    } catch (e) {
      warn('ack: getDevicePushTokenAsync:', e?.message || e);
    }

    // Payload compatible public; on envoie aussi kind + caseId si missing
    const body =
      kind === 'missing'
        ? {
            kind: 'missing',
            caseId: id,
            reason,
            userId: uid || '',
            fcmToken: fcmToken || '',
            platform: Platform.OS || 'unknown',
            ...extra,
          }
        : {
            kind: 'public',
            alertId: id,
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
    try {
      j = await resp.json();
    } catch {
      // pas grave si pas de JSON
    }
    if (!resp.ok) {
      warn('ACK non-OK', { status: resp.status, body: j });
    }
    log('ACK →', { kind, id, reason, status: resp.status, ok: resp.ok, json: j });
  } catch (e) {
    err('ACK FAIL', kind, id, reason, e?.message || e);
  }
}

function ackAlertSafe(data, reason) {
  try {
    const type = String(data?.type || '');
    const extra = {
      channelId: String(data?.channelId || ''),
      appOpenTarget: String(data?.openTarget || ''),
    };

    const key = computeAckKey(data, reason);
    if (!key) {
      // rien à ACK
      return;
    }
    if (__acked.has(key)) {
      return; // idempotence locale
    }
    __acked.add(key);

    if (type === 'missing' && data?.caseId) {
      ackAlert({ kind: 'missing', id: String(data.caseId), reason, extra });
      return;
    }
    if (data?.alertId) {
      ackAlert({ kind: 'public', id: String(data.alertId), reason, extra });
    }
  } catch (e) {
    err('ackAlertSafe:', e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Utilitaires de test locaux (ne passent pas par FCM)
// ---------------------------------------------------------------------------
export async function fireLocalNow(data = {}) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'VigiApp (local)', body: 'Celle-ci est locale', data },
      trigger: null,
    });
  } catch (e) {
    err('fireLocalNow:', e?.message || e);
    throw e;
  }
}

export async function scheduleLocalIn(seconds = 5, data = {}) {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'VigiApp (local)', body: `Programmée +${seconds}s`, data },
      trigger: { seconds },
    });
  } catch (e) {
    err('scheduleLocalIn:', e?.message || e);
    throw e;
  }
}

export async function cancelAll() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    err('cancelAll:', e?.message || e);
    throw e;
  }
}
