// -------------------------------------------------------------
// VigiApp — Notifications (Expo + FCM)
// - Canaux Android: "default" + "alerts-high" (MAX → heads-up)
// - Handler SDK 53+ (shouldShowBanner/List/Sound)
// - Cold start & tap → navigation fiable (attend l’auth si besoin)
// - Expose: initNotifications, attachNotificationListeners,
//           wireAuthGateForNotifications, registerForPushNotificationsAsync,
//           getFcmDeviceTokenAsync (+ utilitaires locaux)
// -------------------------------------------------------------

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from '../firebase';
import { getFirestore, doc, setDoc, arrayUnion } from 'firebase/firestore';

// ===== Constantes de canaux =====
export const DEFAULT_CHANNEL_ID = 'default';
export const ALERTS_HIGH_CHANNEL_ID = 'alerts-high';

const isAndroid = Platform.OS === 'android';
const isAndroid13Plus = isAndroid && Platform.Version >= 33;

// ===== Logs courts =====
const log  = (...a) => console.log('[NOTIF]', ...a);
const warn = (...a) => console.warn('[NOTIF]', ...a);

// ===== Anti double-navigation =====
let __lastHandled = { id: undefined, ts: 0 };

// ===== Gate d’auth pour naviguer après clic =====
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
  if (!__authReady || !__pendingNotifData) return;
  const data = __pendingNotifData;
  __pendingNotifData = null;
  routeFromData(data);
}

// ===== Navigation à partir des data =====
function routeFromData(data = {}) {
  const alertId = String(data?.alertId || '');
  if (!alertId) return;

  const now = Date.now();
  if (__lastHandled.id === alertId && now - (__lastHandled.ts || 0) < 1200) return;
  __lastHandled = { id: alertId, ts: now };

  const openTarget = String(data?.openTarget || 'detail');
  const deepLink   = String(data?.deepLink || '');

  try {
    if (deepLink && deepLink.startsWith('vigiapp://')) {
      // Exemple: vigiapp://public-alerts/123 → /public-alerts/123
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

// ===== Handler foreground (SDK 53+) =====
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ===== Canaux Android =====
async function ensureDefaultChannel() {
  if (!isAndroid) return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Par défaut',
    description: 'Notifications générales',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

async function ensureAlertsHighChannel() {
  if (!isAndroid) return;

  // Info sur l’importance actuelle (si déjà créé)
  try {
    const channels = await Notifications.getNotificationChannelsAsync?.();
    const existing = channels?.find((c) => c.id === ALERTS_HIGH_CHANNEL_ID);
    if (existing) {
      // 1(None) 2(Min) 3(Low) 4(Default) 5(High) 6(Max)
      log('alerts-high: canal déjà présent → importance =', existing.importance);
      if (existing.importance < Notifications.AndroidImportance.HIGH) {
        warn(
          'ATTENTION: "alerts-high" existe avec importance faible.',
          'Android ne permet pas d’augmenter l’importance après création.',
          '→ Désinstalle/réinstalle l’app OU change d’ID de canal.'
        );
      }
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
  if (!isAndroid) return;
  await ensureDefaultChannel();
  await ensureAlertsHighChannel();
  log('Android channels ensured:', DEFAULT_CHANNEL_ID, '+', ALERTS_HIGH_CHANNEL_ID);
}

// ===== Permissions =====
async function ensureAndroid13Permission() {
  if (!isAndroid13Plus) return;
  try {
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
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

// ===== Sauvegarde FCM token (Firestore users/{uid}.fcmTokens += token) =====
async function saveFcmTokenForUser(token) {
  const u = auth?.currentUser;
  if (!u || !token) {
    log('skip save: missing user or token');
    return;
  }
  const db = getFirestore();
  await setDoc(
    doc(db, 'users', u.uid),
    { fcmTokens: arrayUnion(token) },
    { merge: true }
  );
  log('FCM token saved for', u.uid);
}

// ===== Initialisation complète (à appeler au boot) =====
export async function initNotifications() {
  if (isAndroid) {
    await ensureAndroidChannels();    // ✅ canaux avant tout
    await ensureAndroid13Permission();
  }
  await ensureBasePermissions();

  // Cold start: si l’app a été ouverte via une notif
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    const data = resp?.notification?.request?.content?.data;
    if (data?.alertId) {
      log('Cold start from notification → data=', data);
      // Si pas encore authentifié, on bufferise jusqu’à ce que l’auth soit prête
      if (!__authReady) __pendingNotifData = data;
      else routeFromData(data);
    }
  } catch {}
}

// ===== Listeners (foreground + tap) =====
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    try {
      const content = n?.request?.content || {};
      const d = content?.data ?? {};
      // @ts-ignore (clé possible selon SDK)
      const chRemote = n?.request?.trigger?.remoteMessage?.notification?.android?.channelId
        // @ts-ignore
        ?? n?.request?.trigger?.remoteMessage?.notification?.channelId;

      log(
        'received (foreground):',
        'channelId(data)=', d?.channelId,
        'channelId(remote)=', chRemote,
        'title=', content?.title,
        'data=', d
      );

      // Fallback visible si on reçoit un truc “muet” (rare)
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
    } catch {}
    onReceive?.(n);
  });

  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    try {
      const n = r?.notification;
      const d = n?.request?.content?.data ?? {};
      // @ts-ignore
      const chRemote = n?.request?.trigger?.remoteMessage?.notification?.android?.channelId
        // @ts-ignore
        ?? n?.request?.trigger?.remoteMessage?.notification?.channelId;

      log('tap response:', 'channelId(data)=', d?.channelId, 'channelId(remote)=', chRemote, 'data=', d);

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

// ===== Expo Push Token (optionnel si tu utilises l’API Expo Push) =====
export async function registerForPushNotificationsAsync() {
  // initNotifications s’assure déjà des canaux + permissions
  await initNotifications();

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    null;

  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const expoToken = tokenResp?.data || null;
  log('Expo push token =', expoToken);
  return expoToken;
}

// ===== FCM device token (nécessite Dev Client / APK) =====
export async function getFcmDeviceTokenAsync() {
  try {
    if (!Device.isDevice) {
      log('Not a physical device → no FCM token');
      return null;
    }
    await initNotifications(); // canaux + permissions + cold start
    const { data: token } = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
    log('FCM device token =', token);
    if (token) await saveFcmTokenForUser(token);
    return token ?? null;
  } catch (e) {
    warn('getFcmDeviceTokenAsync error:', e?.message || e);
    return null;
  }
}

// ===== Utils de test locaux =====
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
