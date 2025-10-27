// src/notifications.js
// ============================================================================
// VigiApp — Notifications (Expo + FCM) : Public vs Missing (no-regression build)
// - Un seul moteur, deux domaines (public / missing) routés proprement
// - Normalisation large des payloads (alertId|caseId|id, deepLink|deeplink|url, category|type)
// - Expo SDK 53 handler: banner/list (sans shouldShowAlert déprécié)
// - Android channels: default / public-alerts-high / public (legacy) / missing-alerts-urgent
// - ACK: tap = OK (public & missing), receive = OK (public) / SKIP (missing) pour éviter les 500
// - ACK idempotent (receive/tap) avec logs
// - Anti-doublons listeners (hot reload / double mount) + dédoupe 60s
// - Cold start via getLastNotificationResponseAsync()
// ============================================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
export const DEFAULT_CHANNEL_ID = 'default';
export const ALERTS_HIGH_CHANNEL_ID = 'public-alerts-high';
const LEGACY_PUBLIC_ID = 'public';
export const MISSING_CHANNEL_ID = 'missing-alerts-urgent';

const isAndroid = Platform.OS === 'android';
const isAndroid13Plus = isAndroid && Platform.Version >= 33;

// ACK endpoints
const ACK_PUBLIC_ENDPOINT =
  'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/ackPublicAlertReceipt';
// Optionnel : si tu crées un jour un endpoint missing, mets l’URL ici
const ACK_MISSING_ENDPOINT = null; // ex: 'https://.../ackMissingReceipt'

// Map de routes (aligne avec ton app/)
const ROUTES = {
  public: (id) => `/public-alerts/${encodeURIComponent(id)}`,
  missing: (id) => `/missing-public-alerts/${encodeURIComponent(id)}`,
};

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
const TAG = '[NOTIF]';
const log  = (...a) => console.log(`${TAG} 📣`, ...a);
const warn = (...a) => console.warn(`${TAG} ⚠️`, ...a);
const err  = (...a) => console.error(`${TAG} ❌`, ...a);

// ---------------------------------------------------------------------------
// État interne (anti double init / attach / spam / auth gate)
// ---------------------------------------------------------------------------
let __handlerSet = false;
let __listenersSet = false;
let __initDone = false;

let __authReady = false;
let __pendingNotifData = null;
let __lastTap = { id: undefined, ts: 0 };

const __acked = new Set(); // `${id}|${reason}`
const __receivedRecently = new Map(); // id -> ts
const RECEIVE_DEDUP_MS = 60_000; // 60s

// ---------------------------------------------------------------------------
// Handler FG (Expo SDK 53+)
// ---------------------------------------------------------------------------
function ensureNotificationHandler() {
  if (__handlerSet) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      // Expo 53 : préférer banner/list (shouldShowAlert est déprécié)
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  __handlerSet = true;
  log('Handler FG installé ✅ (banner/list + sound)');
}

// ---------------------------------------------------------------------------
// Channels Android
// ---------------------------------------------------------------------------
async function ensureDefaultChannel() {
  if (!isAndroid) return;
  await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
    name: 'Par défaut',
    description: 'Notifications générales',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
  log(`📦 Canal "default" prêt (DEFAULT)`);
}

async function ensureMaxChannel(id, label, vibrationPattern = [0, 500, 300, 500]) {
  if (!isAndroid) return;
  await Notifications.setNotificationChannelAsync(id, {
    name: label,
    description: 'Alertes importantes',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
  log(`🚨 Canal "${id}" prêt (MAX)`);
}

export async function ensureAndroidChannels() {
  if (!isAndroid) return;
  await ensureDefaultChannel();
  await ensureMaxChannel(ALERTS_HIGH_CHANNEL_ID, 'Alertes publiques (élevé)');
  await ensureMaxChannel(LEGACY_PUBLIC_ID, 'Alertes publiques (legacy)');
  await ensureMaxChannel(MISSING_CHANNEL_ID, 'Missing — Urgent', [0, 800, 300, 800, 300, 600]);

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
  if (!isAndroid13Plus) return;
  try {
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
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
// INIT (unique)
// ---------------------------------------------------------------------------
export async function initNotifications() {
  if (__initDone) {
    log('🧰 initNotifications() — déjà fait (skip)');
    return;
  }
  ensureNotificationHandler();
  log('🧰 initNotifications() — permissions + canaux');
  if (isAndroid) {
    log('🔧 Préparation Android (channels + permission 13+)');
    await ensureAndroidChannels();
    await ensureAndroid13Permission();
  }
  await ensureBasePermissions();
  __initDone = true;
  log('✅ Notifications prêtes');
}

// ---------------------------------------------------------------------------
// Cold start helper
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
// Utils : normalisation / helpers
// ---------------------------------------------------------------------------
function toStringOrEmpty(v) {
  if (v === undefined || v === null) return '';
  try { return String(v); } catch { return ''; }
}

function pickAny(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v) !== '') return String(v);
  }
  return '';
}

function maybeParseData(d) {
  // Certains providers envoient data stringifiée
  if (typeof d === 'string') {
    try { return JSON.parse(d); } catch { /* noop */ }
  }
  // Parfois data est sous-clé "data" encore stringifiée
  if (d && typeof d.data === 'string') {
    try { return { ...d, ...JSON.parse(d.data) }; } catch { /* noop */ }
  }
  return d || {};
}

// Unifie les champs hétérogènes d’un payload (logs inclus)
function normalizePayload(raw = {}) {
  const data = maybeParseData(raw);

  const id = pickAny(data, [
    'alertId','caseId','id',
    'alert_id','case_id','alertID','caseID'
  ]);

  const rawUrl = pickAny(data, [
    'url','deepLink','deeplink','deep_link','link','open','href','route'
  ]);

  const categoryOrType = pickAny(data, [
    'category','type','notifType','notification_type'
  ]).toLowerCase();

  const channel = toStringOrEmpty(data?.channelId || data?.channel_id).toLowerCase();

  const isMissing =
    categoryOrType === 'missing' ||
    channel === MISSING_CHANNEL_ID ||
    (rawUrl && rawUrl.startsWith('vigiapp://missing/')) ||
    pickAny(data, ['domain','scope']).toLowerCase() === 'missing';

  const norm = { id, rawUrl, categoryOrType, channel, isMissing, _raw: data };
  log('🧾 normalize →', norm);
  return norm;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function routeFromData(data = {}) {
  const { id: alertId, rawUrl, isMissing, _raw } = normalizePayload(data);
  if (!alertId) { warn('route: id manquant (alertId|caseId|id)'); return; }

  // Anti double-tap trop rapproché
  const now = Date.now();
  if (__lastTap.id === alertId && now - (__lastTap.ts || 0) < 1200) {
    warn('⏱️ double route évitée (1.2s) pour', alertId);
    return;
  }
  __lastTap = { id: alertId, ts: now };

  // Deep link prioritaire – normalise missing → missing-public-alerts
  const link = (rawUrl || '').trim();
  if (link && link.startsWith('vigiapp://')) {
    let path = link.replace('vigiapp://', '/');
    if (/^\/missing\/[^/]+/i.test(path)) {
      const id = path.split('/').pop();
      path = ROUTES.missing(id);
    }
    log('🧭 router.push (deepLink) →', path);
    router.push(path);
    return;
  }

  // Domaine Missing prioritaire si détecté
  if (isMissing) {
    const path = ROUTES.missing(alertId);
    log('🧭 router.push (MISSING) →', path);
    router.push(path);
    return;
  }

  // Fallback public (inchangé + tolérance openTarget)
  const openTarget = String(_raw?.openTarget || data?.openTarget || 'detail');
  if (openTarget === 'home') {
    const path = `/(tabs)/home?fromNotif=1&alertId=${encodeURIComponent(alertId)}`;
    log('🧭 router.push →', path);
    router.push(path);
  } else {
    const path = ROUTES.public(alertId);
    log('🧭 router.push →', path);
    router.push(path);
  }
}

// ---------------------------------------------------------------------------
// Listeners (FG + Tap) — anti double attach
// ---------------------------------------------------------------------------
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  log('👂 attachNotificationListeners()');
  ensureNotificationHandler();

  if (__listenersSet) {
    log('👂 Listeners déjà attachés — skip');
    return () => {};
  }
  __listenersSet = true;

  // Réception FG
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    try {
      const content = n?.request?.content || {};
      const d0 = content?.data ?? {};
      const d = maybeParseData(d0);
      log('📥 received(FG) → data =', JSON.stringify(d));

      const { id, isMissing } = normalizePayload(d);

      // Dédupe simple 60s par id si présent
      if (id) {
        const now = Date.now();
        const last = __receivedRecently.get(id) || 0;
        if (now - last < RECEIVE_DEDUP_MS) {
          warn('🧯 dedupe(FG): ignore id', id);
          return;
        }
        __receivedRecently.set(id, now);
      }

      // Fallback local ULTRA-prudent: seulement si data-only (sans title ET sans body)
      if (Platform.OS === 'android' && !content?.title && !content?.body) {
        const ch = String(d?.channelId || ALERTS_HIGH_CHANNEL_ID);
        Notifications.scheduleNotificationAsync({
          content: {
            title: d?.title || 'VigiApp — Alerte',
            body: d?.body || 'Nouvelle alerte',
            data: { ...d, __localFallback: 1 },
            channelId: ch,
          },
          trigger: null,
        })
          .then((nid) => log('🧩 Fallback local schedulé (FG) id=', nid, 'key=', id || 'n/a'))
          .catch((e) => warn('fallback local notif:', e?.message || e));
      }

      // ACK "receive": public OK, missing SKIP (évite 500)
      if (id) {
        if (isMissing) {
          log('♻️ ACK receive SKIP (missing) id=', id);
        } else {
          ackAlertSafe({ ...d, id }, 'receive', { isMissing });
        }
      }

      try { onReceive?.(n); } catch (e) { warn('onReceive callback error:', e?.message || e); }
    } catch (e) {
      err('received(FG) handler:', e?.message || e);
    }
  });

  // Tap (BG/kill/FG)
  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    try {
      const n = r?.notification;
      const d0 = n?.request?.content?.data ?? {};
      const d = maybeParseData(d0);
      log('👆 TAP response →', JSON.stringify(d));

      const { id, isMissing } = normalizePayload(d);

      // ACK "tap" toujours (public & missing)
      if (id) ackAlertSafe({ ...d, id }, 'tap', { isMissing });

      if (!__authReady) {
        __pendingNotifData = d;
        log('⛓️ auth gate: navigation différée');
      } else {
        routeFromData(d);
      }
      try { onResponse?.(r); } catch (e) { warn('onResponse callback error:', e?.message || e); }
    } catch (e) {
      err('tap handler:', e?.message || e);
    }
  });

  log('👂 Listeners attachés ✅');
  return () => {
    try { sub1?.remove?.(); log('🧹 detachNotif sub1 OK'); } catch (e) { warn('🧹 detachNotif sub1 error:', e?.message || e); }
    try { sub2?.remove?.(); log('🧹 detachNotif sub2 OK'); } catch (e) { warn('🧹 detachNotif sub2 error:', e?.message || e); }
    __listenersSet = false;
  };
}

// ---------------------------------------------------------------------------
// Tokens
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
function ackAlertSafe(data, reason, { isMissing = false } = {}) {
  const id =
    (data?.alertId || data?.caseId || data?.id ||
     data?.alert_id || data?.case_id || '').toString();
  if (!id) { warn('ACK skip: id manquant'); return; }

  const key = `${id}|${reason}`;
  if (__acked.has(key)) {
    log('♻️ ACK ignoré (idempotent):', key);
    return;
  }
  __acked.add(key);

  const extra = {
    channelId: String(data?.channelId || data?.channel_id || ''),
    appOpenTarget: String(data?.openTarget || ''),
    category: String(data?.category || data?.type || ''),
  };
  ackAlert({ alertId: id, reason, extra, isMissing });
}

async function ackAlert({ alertId, reason = 'receive', extra = {}, isMissing = false }) {
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
      domain: isMissing ? 'missing' : 'public',
    };

    // Route ACK vers endpoint adapté ou fallback public
    let url = ACK_PUBLIC_ENDPOINT;
    if (isMissing && ACK_MISSING_ENDPOINT) url = ACK_MISSING_ENDPOINT;

    const resp = await fetch(url, {
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
