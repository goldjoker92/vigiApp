// notifications.js
// ======================================================================
// VigiApp — Lib notifications (Expo SDK 53+)
// - Handler global (foreground) — idempotent
// - Permissions Android 13+
// - Création du canal Android "default" — idempotent
// - Récupération Expo Push Token (via EAS projectId)
// - Listeners (réception / interaction) + cleanup
// - Envoi test via Expo Push API (DEV)
// - Notifications locales (debug)
// - LOGS détaillés avec timestamps (masquage partiel du token)
// ======================================================================

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ================== Logging util ==================
const APP_TAG = 'VigiApp';
const LIB_TAG = 'NotifLib';
const extra = Constants?.expoConfig?.extra || {};
const SILENCE_RELEASE = !!extra?.SILENCE_CONSOLE_IN_RELEASE; // mets true dans app.config.js/extra pour couper en release

function ts() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}
function log(...args) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try {
      console.log(`[${APP_TAG}][${LIB_TAG}][${ts()}]`, ...args);
    } catch {}
  }
}
function warn(...args) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try {
      console.warn(`[${APP_TAG}][${LIB_TAG}][${ts()}]`, ...args);
    } catch {}
  }
}
function err(...args) {
  if (__DEV__ || !SILENCE_RELEASE) {
    try {
      console.error(`[${APP_TAG}][${LIB_TAG}][${ts()}]`, ...args);
    } catch {}
  }
}
function maskToken(tok) {
  if (!tok) return tok;
  const s = String(tok);
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-6)} (${s.length})` : s;
}
function safeJson(obj, max = 1200) {
  try {
    return JSON.stringify(obj, null, 2).slice(0, max);
  } catch {
    return '[unserializable]';
  }
}

// ================== Constantes ==================
export const DEFAULT_CHANNEL_ID = 'default';

// ================== Handler global (idempotent) ==================
let _handlerSet = false;
if (!_handlerSet) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    _handlerSet = true;
    log('setNotificationHandler initialized');
  } catch (e) {
    err('setNotificationHandler failed:', e?.message || e);
  }
}

// ================== Registration ==================
export async function registerForPushNotificationsAsync() {
  log('register: start');

  if (!Device.isDevice) {
    warn('register: running on simulator/emulator — push may not work');
  }

  // 1) Canal Android (idempotent)
  if (Platform.OS === 'android') {
    try {
      log(`register: creating channel '${DEFAULT_CHANNEL_ID}'`);
      await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: true,
        sound: 'default',
      });
      log('register: channel ready');
    } catch (e) {
      err('register: channel creation failed:', e?.message || e);
    }
  }

  // 2) Permissions (Android 13+)
  let finalStatus = 'undetermined';
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    log('register: permissions existing =', existing);
    finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
  } catch (e) {
    err('register: permissions failed:', e?.message || e);
  }
  if (finalStatus !== 'granted') {
    const msg = `Notifications permission not granted (status=${finalStatus})`;
    err('register:', msg);
    throw new Error(msg);
  }

  // 3) ProjectId EAS (nécessaire à getExpoPushTokenAsync)
  const extras = Constants?.expoConfig?.extra || {};
  const projectId = extras?.eas?.projectId || Constants?.easConfig?.projectId || undefined;
  if (!projectId) {
    warn('register: missing EAS projectId — check app.config.js extra.eas.projectId');
  } else {
    log('register: EAS projectId =', projectId);
  }

  // 4) Expo Push Token
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    log('register: Expo token obtained =', maskToken(token));
    return token;
  } catch (e) {
    err('register: getExpoPushTokenAsync failed:', e?.message || e);
    throw e;
  }
}

// ================== Listeners ==================
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  log('listeners: attaching');

  const receivedSub = Notifications.addNotificationReceivedListener((n) => {
    log('listeners: RECEIVED =', safeJson(n));
    try {
      onReceive && onReceive(n);
    } catch (e) {
      err('listeners:onReceive error', e?.message || e);
    }
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((r) => {
    log('listeners: RESPONSE =', safeJson(r));
    try {
      onResponse && onResponse(r);
    } catch (e) {
      err('listeners:onResponse error', e?.message || e);
    }
  });

  const cleanup = () => {
    log('listeners: cleanup');
    try {
      receivedSub.remove();
      log('listeners: receivedSub removed');
    } catch (e) {
      warn('listeners: receivedSub remove failed', e?.message || e);
    }
    try {
      responseSub.remove();
      log('listeners: responseSub removed');
    } catch (e) {
      warn('listeners: responseSub remove failed', e?.message || e);
    }
  };

  return cleanup;
}

// ================== Envoi test (Expo Push API) ==================
export async function sendExpoTestPushAsync(
  expoPushToken,
  message = 'Ping VigiApp 🚨 — test Expo Push API',
) {
  if (!expoPushToken) throw new Error('Expo push token manquant');

  const payload = {
    to: expoPushToken,
    sound: 'default',
    title: 'VigiApp — Test push',
    body: message,
    data: { ts: Date.now(), kind: 'test' },
    channelId: DEFAULT_CHANNEL_ID,
  };

  log(
    'sendExpoTestPush: POST exp.host | to=',
    maskToken(expoPushToken),
    'payload=',
    safeJson(payload, 400),
  );

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    log('sendExpoTestPush: http', res.status, res.statusText, 'body=', text.slice(0, 800));

    // Tentative de parse JSON (API Expo renvoie json)
    try {
      const json = JSON.parse(text);
      const status = Array.isArray(json?.data) ? json?.data?.[0]?.status : json?.data?.status;
      if (status && status !== 'ok') {
        warn('sendExpoTestPush: delivery status =', status, 'json=', safeJson(json));
      }
      return json;
    } catch {
      warn('sendExpoTestPush: non-JSON response, returning raw');
      return { raw: text };
    }
  } catch (e) {
    err('sendExpoTestPush: fetch failed:', e?.message || e);
    throw e;
  }
}

// ================== Notifications locales (debug) ==================
export async function fireLocalNow() {
  log('local: immediate');
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'VigiApp — Local immédiate',
        body: 'Ceci est une notification locale',
        data: { kind: 'local_now', ts: Date.now() },
      },
      trigger: null,
    });
    log('local: scheduled immediate id=', id);
    return id;
  } catch (e) {
    err('local: immediate failed:', e?.message || e);
    throw e;
  }
}

export async function scheduleLocalIn(seconds) {
  const s = Number.isFinite(Number(seconds)) ? Number(seconds) : 5;
  log(`local: schedule in ${s}s`);
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'VigiApp — Local programmée',
        body: `Déclenchée après ${s}s`,
        data: { kind: 'local_scheduled', ts: Date.now(), delay: s },
      },
      trigger: { seconds: s },
    });
    log('local: scheduled id=', id);
    return id;
  } catch (e) {
    err('local: schedule failed:', e?.message || e);
    throw e;
  }
}

export async function cancelAll() {
  log('local: cancelAll');
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    log('local: cancelAll ok');
  } catch (e) {
    err('local: cancelAll failed:', e?.message || e);
    throw e;
  }
}
