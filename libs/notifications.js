// libs/notifications.js
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';

// ⚠️ Firebase Web SDK (tu as déjà ../firebase dans ton app)
import { auth } from '../firebase';
import { getFirestore, doc, setDoc, arrayUnion } from 'firebase/firestore';

// Afficher les notifs même en foreground (utile en dev)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    // Expo SDK 53+: shouldShowBanner (iOS) / Android ignore → OK
    shouldShowBanner: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ============== Navigation depuis data.openTarget ==============
let __lastHandled = { id: undefined, ts: 0 };

function goToFromData(data = {}) {
  const alertId = data?.alertId;
  if (!alertId) {
    return;
  }

  const now = Date.now();
  if (__lastHandled.id === alertId && now - (__lastHandled.ts || 0) < 1500) {
    return;
  }
  __lastHandled = { id: alertId, ts: now };

  const openTarget = String(data?.openTarget || 'detail');
  if (openTarget === 'home') {
    router.push(`/(tabs)/home?fromNotif=1&alertId=${encodeURIComponent(alertId)}`);
  } else {
    router.push(`/public-alerts/${String(alertId)}`);
  }
}

// ============== Listeners ==============
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  const sub1 = Notifications.addNotificationReceivedListener((n) => onReceive?.(n));
  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    onResponse?.(r);
    const data = r?.notification?.request?.content?.data;
    if (data?.alertId) {
      goToFromData(data);
    }
  });

  // Cold start (app lancée depuis une notif)
  Notifications.getLastNotificationResponseAsync()
    .then((resp) => {
      const data = resp?.notification?.request?.content?.data;
      if (data?.alertId) {
        goToFromData(data);
      }
    })
    .catch(() => {});

  return () => {
    try { sub1?.remove?.(); } catch {}
    try { sub2?.remove?.(); } catch {}
  };
}

// ============== Canal Android ==============
export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
  });
}

// ============== Permission Android 13+ ==============
async function ensureAndroid13Permission() {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    try {
      const r = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      console.log('[NOTIF] POST_NOTIFICATIONS:', r);
    } catch (e) {
      console.log('[NOTIF] POST_NOTIFICATIONS error:', e?.message || e);
    }
  }
}

// ============== Sauvegarde Firestore (Web SDK) ==============
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

// ============== Expo push token (API Expo) ==============
export async function registerForPushNotificationsAsync() {
  await ensureAndroidChannel();
  await ensureAndroid13Permission();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    throw new Error('Permission notifications refusée');
  }

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

// ============== FCM device token (Cloud Functions) ==============
// ⚠️ Nécessite APK/AAB EAS ou Dev Client (pas Expo Go)
export async function getFcmDeviceTokenAsync() {
  try {
    if (!Device.isDevice) {
      console.log('[NOTIF] Not a physical device → no FCM token');
      return null;
    }
    await ensureAndroidChannel();
    await ensureAndroid13Permission();

    const { data: token } = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
    console.log('[NOTIF] FCM device token =', token);

    if (token) {
      await saveFcmTokenForUser(token);
    }
    return token ?? null;
  } catch (e) {
    console.log('[NOTIF] getFcmDeviceTokenAsync error:', e?.message || e);
    return null;
  }
}

// ============== Envoi test via API Expo ==============
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

// ============== Notifs locales ==============
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
