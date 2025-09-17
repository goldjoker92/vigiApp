// libs/notifications.js
// -------------------------------------------------------------
// Notifications (Expo + FCM) pour VigiApp
// - Foreground: handler moderne (SDK 53+) => shouldShowBanner/shouldShowList
// - Background / App fermée: affichage par le SYSTÈME via payload FCM
//   => impératif que le canal ANDROID existe: "alerts-high"
// - Canaux Android: "default" (compat) + "alerts-high" (prioritaire)
// - Garde-fous + logs clairs + fallback local en foreground si canal manquant
// - Persist FCM token utilisateur dans Firestore (Web SDK)
// -------------------------------------------------------------

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';

// Firebase Web SDK (déjà configuré côté app)
import { auth } from '../firebase';
import { getFirestore, doc, setDoc, arrayUnion } from 'firebase/firestore';

// ====== Constantes de canaux (doivent matcher le backend) ======
export const DEFAULT_CHANNEL_ID = 'default';
export const ALERTS_HIGH_CHANNEL_ID = 'alerts-high';

// ====== Handler foreground (SDK 53+) ======
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, // heads-up (iOS) ; Android ignore → géré par importance du canal
    shouldShowList: true,   // apparaît dans le tiroir
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ====== Utils internes ======
const isAndroid = Platform.OS === 'android';
const isAndroid13Plus = isAndroid && Platform.Version >= 33;

// Un petit anti double-navigation
let __lastHandled = { id: undefined, ts: 0 };

// Navigation à partir des data FCM
function goToFromData(data = {}) {
  const alertId = data?.alertId;
  if (!alertId) return;

  const now = Date.now();
  if (__lastHandled.id === alertId && now - (__lastHandled.ts || 0) < 1500) return;
  __lastHandled = { id: alertId, ts: now };

  const openTarget = String(data?.openTarget || 'detail');
  if (openTarget === 'home') {
    router.push(`/(tabs)/home?fromNotif=1&alertId=${encodeURIComponent(alertId)}`);
  } else {
    router.push(`/public-alerts/${String(alertId)}`);
  }
}

// ====== Canaux Android ======

/**
 * Crée/Met à jour le canal "default" (compat).
 */
async function ensureDefaultChannel() {
  if (!isAndroid) return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Par défaut',
    description: 'Notifications générales',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

/**
 * Crée/Met à jour le canal "alerts-high" (celui qu’envoie le backend FCM).
 * Importance MAX pour heads-up. Si le canal a déjà été créé avec une
 * importance trop basse, Android ne change pas l’importance : il faut
 * réinstaller l’app ou changer d’ID. On loggue clairement ce cas.
 */
async function ensureAlertsHighChannel() {
  if (!isAndroid) return;

  // (Best effort) On tente de lire la liste des canaux pour informer l’importance actuelle
  try {
    const channels = await Notifications.getNotificationChannelsAsync?.();
    const existing = channels?.find((c) => c.id === ALERTS_HIGH_CHANNEL_ID);
    if (existing) {
      // importance: 1(None) 2(Min) 3(Low) 4(Default) 5(High) 6(Max) selon Android
      console.log('[NOTIF] alerts-high: canal déjà présent → importance =', existing.importance);
      if (existing.importance < Notifications.AndroidImportance.HIGH) {
        console.warn(
          '[NOTIF] ATTENTION: le canal "alerts-high" existe avec une importance faible.',
          'Android ne permet pas d’augmenter l’importance après création.',
          '→ Désinstalle/réinstalle l’app OU change d’ID de canal côté app & backend.'
        );
      }
    }
  } catch (e) {
    // pas bloquant
  }

  await Notifications.setNotificationChannelAsync(ALERTS_HIGH_CHANNEL_ID, {
    name: 'Alertes publiques (élevé)',
    description: 'Alertes importantes et critiques',
    importance: Notifications.AndroidImportance.MAX, // heads-up
    vibrationPattern: [0, 240, 200, 240],
    enableVibrate: true,
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false, // laisser l’utilisateur gérer DnD
  });
}

/**
 * Public: assure la présence des canaux nécessaires Android.
 */
export async function ensureAndroidChannels() {
  if (!isAndroid) return;
  await ensureDefaultChannel();
  await ensureAlertsHighChannel();
  console.log('[NOTIF] Android channels ensured:', DEFAULT_CHANNEL_ID, '+', ALERTS_HIGH_CHANNEL_ID);
}

// ====== Permissions ======

async function ensureAndroid13Permission() {
  if (!isAndroid13Plus) return;
  try {
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    console.log('[NOTIF] POST_NOTIFICATIONS (Android 13+):', r);
  } catch (e) {
    console.log('[NOTIF] POST_NOTIFICATIONS error:', e?.message || e);
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

// ====== Sauvegarde FCM token utilisateur (Firestore) ======
async function saveFcmTokenForUser(token) {
  const u = auth?.currentUser;
  if (!u || !token) {
    console.log('[NOTIF] skip save: missing user or token');
    return;
  }
  const db = getFirestore();
  await setDoc(
    doc(db, 'users', u.uid),
    { fcmTokens: arrayUnion(token) },
    { merge: true }
  );
  console.log('[NOTIF] FCM token saved for', u.uid);
}

// ====== Initialisation à appeler au boot de l’app ======
/**
 * Initialise les canaux/permissions. À appeler très tôt (layout/root).
 * @example useEffect(() => { initNotifications().catch(console.warn) }, [])
 */
export async function initNotifications() {
  if (isAndroid) {
    await ensureAndroidChannels();
    await ensureAndroid13Permission();
  }
  await ensureBasePermissions();

  // Cold start (app ouverte via une notif)
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    const data = resp?.notification?.request?.content?.data;
    if (data?.alertId) {
      console.log('[NOTIF] Cold start from notification → data=', data);
      goToFromData(data);
    }
  } catch {}
}

// ====== Listeners ======
/**
 * Attache les listeners (foreground + taps). Retourne une fonction de cleanup.
 * Loggue aussi les infos de canal reçues pour diagnostiquer.
 */
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    try {
      const d = n?.request?.content?.data ?? {};
      // remoteMessage présent sur Android FCM
      // @ts-ignore
      const chRemote = n?.request?.trigger?.remoteMessage?.notification?.android?.channelId
        // @ts-ignore (fallback ancienne clé)
        ?? n?.request?.trigger?.remoteMessage?.notification?.channelId;

      console.log(
        '[NOTIF] received (foreground):',
        'channelId(data)=', d?.channelId,
        'channelId(remote)=', chRemote,
        'title=', n?.request?.content?.title,
        'data=', d
      );

      // ⛑️ Fallback foreground:
      // si la notif vient sur un canal inconnu/inaudible et rien ne s’affiche,
      // on force une locale visible sur DEFAULT (évite “bip sans bannière”).
      if (Platform.OS === 'android' && !n?.request?.content?.title) {
        // pas de titre => comportement suspect; on reprogramme en local
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

      console.log(
        '[NOTIF] tap response:',
        'channelId(data)=', d?.channelId,
        'channelId(remote)=', chRemote,
        'data=', d
      );
    } catch {}
    onResponse?.(r);
    const data = r?.notification?.request?.content?.data;
    if (data?.alertId) goToFromData(data);
  });

  return () => {
    try { sub1?.remove?.(); } catch {}
    try { sub2?.remove?.(); } catch {}
  };
}

// ====== Expo Push Token (optionnel si tu utilises l’API Expo) ======
export async function registerForPushNotificationsAsync() {
  await initNotifications(); // canaux + permissions + cold start
  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    null;

  const tokenResp = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const expoToken = tokenResp?.data || null;
  console.log('[NOTIF] Expo push token =', expoToken);
  return expoToken;
}

// ====== FCM device token natif (Cloud Messaging) ======
// ⚠️ Nécessite Dev Client / APK/AAB (pas Expo Go)
export async function getFcmDeviceTokenAsync() {
  try {
    if (!Device.isDevice) {
      console.log('[NOTIF] Not a physical device → no FCM token');
      return null;
    }
    await initNotifications(); // canaux + permissions
    const { data: token } = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
    console.log('[NOTIF] FCM device token =', token);
    if (token) await saveFcmTokenForUser(token);
    return token ?? null;
  } catch (e) {
    console.log('[NOTIF] getFcmDeviceTokenAsync error:', e?.message || e);
    return null;
  }
}

// ====== Utilitaires de test ======
export async function sendExpoTestPushAsync(toToken, body = 'Test') {
  const resp = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: toToken,
      title: 'VigiApp',
      body,
      data: { kind: 'test', channelId: DEFAULT_CHANNEL_ID },
      sound: 'default',
      channelId: DEFAULT_CHANNEL_ID,
    }),
  });
  const json = await resp.json();
  if (!resp.ok || json?.data?.status === 'error') {
    throw new Error(json?.data?.message || JSON.stringify(json));
  }
  return json;
}

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
