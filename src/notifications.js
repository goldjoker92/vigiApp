// src/notifications.js
// =============================================================================
// VigiApp — Notifications (Expo + FCM) [JavaScript pur]
// FG + BG + Killed : bannières garanties si OS le permet.
// - Handler FG (shouldShowBanner/list/sound) ✅
// - Canaux Android MAX + bypass DND + vibration ✅
// - Routing cold/FG/Tap robuste ✅
// - ACK idempotent (public) ✅
// - Dédoublonnage FG 60s ✅
// - Logs ultra verbeux + emojis ✅
// =============================================================================

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

// ---------------------------------------------------------------------------
// Constantes & config (IDs de canaux en minuscules)
// ---------------------------------------------------------------------------
export const DEFAULT_CHANNEL_ID = 'default';
export const ALERTS_HIGH_CHANNEL_ID = 'public-alerts-high';
const LEGACY_PUBLIC_ID = 'public';
export const MISSING_CHANNEL_ID = 'missing-alerts-urgent';

const isAndroid = Platform.OS === 'android';
const isAndroid13Plus = isAndroid && Platform.Version >= 33;

// Alias tolérés → normalisés en minuscules
const CHANNEL_ALIASES = {
  'alerts-high': ALERTS_HIGH_CHANNEL_ID,
  public: ALERTS_HIGH_CHANNEL_ID,
  missing: MISSING_CHANNEL_ID,
};

function normalizeChannelId(ch) {
  const key = String(ch || '')
    .toLowerCase()
    .trim();
  return CHANNEL_ALIASES[key] || key;
}

// ---------------------------------------------------------------------------
// Endpoints ACK (minuscule prioritaire, puis CamelCase)
// ---------------------------------------------------------------------------
const ACK_PUBLIC_URL_CANDIDATES = Object.freeze([
  'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/ackpublicalertreceipt', // ✅ minuscule
  'https://southamerica-east1-vigiapp-c7108.cloudfunctions.net/ackPublicAlertReceipt', // fallback legacy
]);

const ACK_MISSING_ENDPOINT = null; // ex: 'https://.../ackmissingreceipt'

// Cache global
const G = globalThis;
G.__VIGI_NOTIF = G.__VIGI_NOTIF || {
  handlerSet: false,
  listenersSet: false,
  initDone: false,
  authReady: false,
  pendingNotifData: null,
  lastTap: { id: undefined, ts: 0 },
  acked: new Set(),
  receivedRecently: new Map(), // id -> ts
  ackUrlPublic: null,
  ackUrlMissing: null,
};

// ---------------------------------------------------------------------------
// UI Logs utilitaires
// ---------------------------------------------------------------------------
const TAG = '[NOTIF]';
const log = (...a) => console.log(`${TAG} 📣`, ...a);
const warn = (...a) => console.warn(`${TAG} ⚠️`, ...a);
const err = (...a) => console.error(`${TAG} 🛑`, ...a);

const dTag = (domain) => (domain === 'missing' ? 'MISSING' : 'PUBLIC');
const dLog = (domain, ...args) => console.log(`${TAG} 🎯 [${dTag(domain)}]`, ...args);
const dWarn = (domain, ...args) => console.warn(`${TAG} 🟠 [${dTag(domain)}]`, ...args);

// ---------------------------------------------------------------------------
// Dédoublonnage
// ---------------------------------------------------------------------------
const RECEIVE_DEDUP_MS = 60_000; // 60s — fenêtre réaliste

// ---------------------------------------------------------------------------
// Handler FG (bannière/list/sound)
// ---------------------------------------------------------------------------
function ensureNotificationHandler() {
  if (G.__VIGI_NOTIF.handlerSet) {return;}
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, // ✅ affiche la bannière (remplace shouldShowAlert)
      shouldShowList: true, // ✅ place dans le centre de notifications
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  G.__VIGI_NOTIF.handlerSet = true;
  log('🧩 Handler FG installé ✅ (banner+list+sound)');
}

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
  log('📦 Canal "default" prêt (DEFAULT)');
}

async function ensureMaxChannel(id, label, vibrationPattern = [0, 500, 300, 500]) {
  if (!isAndroid) {return;}
  await Notifications.setNotificationChannelAsync(id, {
    name: label,
    description: 'Alertes importantes',
    importance: Notifications.AndroidImportance.MAX, // ✅ heads-up
    sound: 'default',
    enableVibrate: true,
    vibrationPattern,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true, // ✅ autorise heads-up même en DND (selon OEM)
  });
  log(`🚨 Canal "${id}" prêt (MAX)`);
}

export async function ensureAndroidChannels() {
  if (!isAndroid) {return;}
  await ensureDefaultChannel();
  await ensureMaxChannel(ALERTS_HIGH_CHANNEL_ID, 'Alertes publiques (élevé)');
  await ensureMaxChannel(LEGACY_PUBLIC_ID, 'Alertes publiques (legacy)');
  await ensureMaxChannel(MISSING_CHANNEL_ID, 'Missing — Urgent', [0, 800, 300, 800, 300, 600]);

  try {
    const list = await Notifications.getNotificationChannelsAsync?.();
    const brief = list?.map((c) => ({ id: c.id, importance: c.importance }));
    log('🔎 Channels actuels →', brief);
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
  if (finalStatus !== 'granted') {throw new Error('Permission notifications refusée');}
  log('✅ Permissions notifications OK');
}

// ---------------------------------------------------------------------------
export function wireAuthGateForNotifications(authInstance = auth) {
  try {
    onAuthStateChanged(authInstance, (u) => {
      G.__VIGI_NOTIF.authReady = !!u;
      log('🔐 Auth state →', G.__VIGI_NOTIF.authReady ? 'ready ✅' : 'not-ready ⏳');
      if (G.__VIGI_NOTIF.authReady && G.__VIGI_NOTIF.pendingNotifData) {
        try {
          const d = G.__VIGI_NOTIF.pendingNotifData;
          G.__VIGI_NOTIF.pendingNotifData = null;
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
  if (G.__VIGI_NOTIF.initDone) {
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
  G.__VIGI_NOTIF.initDone = true;
  log('✅ Notifications prêtes');
}

// ---------------------------------------------------------------------------
// Cold start helper
// ---------------------------------------------------------------------------
export async function checkInitialNotification(cb) {
  try {
    const resp = await Notifications.getLastNotificationResponseAsync();
    log('🌡️ checkInitialNotification()');
    if (!resp) {
      log('🌡️ Cold start: aucune notif initiale');
      return null;
    }
    cb?.(resp);
    return resp;
  } catch (e) {
    warn('checkInitialNotification error:', e?.message || e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers de normalisation (sans mutiler les données)
// ---------------------------------------------------------------------------
function toStringOrEmpty(v) {
  if (v === undefined || v === null) {return '';}
  try {
    return String(v);
  } catch {
    return '';
  }
}

function pickAny(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v) !== '') {return String(v);}
  }
  return '';
}

function maybeParseData(d) {
  if (typeof d === 'string') {
    try {
      return JSON.parse(d);
    } catch {
      /* noop */
    }
  }
  if (d && typeof d.data === 'string') {
    try {
      return { ...d, ...JSON.parse(d.data) };
    } catch {
      /* noop */
    }
  }
  return d || {};
}

function validateDeepLink(raw) {
  const s = String(raw || '');
  const ok = /^vigiapp:\/\/[a-z]+\/[A-Za-z0-9_\-]+$/i.test(s);
  if (!ok && s) {warn('🧪 deeplink INVALID', s);}
  return { ok, s };
}

// Normalisation payload + logs
function normalizePayload(raw = {}) {
  const data = maybeParseData(raw);

  const id = pickAny(data, ['alertId', 'caseId', 'id', 'alert_id', 'case_id', 'alertID', 'caseID']);
  const rawUrl = pickAny(data, [
    'url',
    'deepLink',
    'deeplink',
    'deep_link',
    'link',
    'open',
    'href',
    'route',
  ]);
  const categoryOrType = pickAny(data, [
    'category',
    'type',
    'notifType',
    'notification_type',
  ]).toLowerCase();

  const rawCh = toStringOrEmpty(data?.channelId || data?.channel_id);
  const channel = normalizeChannelId(rawCh);

  const isMissing =
    categoryOrType === 'missing' ||
    channel === MISSING_CHANNEL_ID ||
    (!!rawUrl && rawUrl.toLowerCase().startsWith('vigiapp://missing/')) ||
    pickAny(data, ['domain', 'scope']).toLowerCase() === 'missing';

  const domain = isMissing ? 'missing' : 'public';
  const channelResolved = isMissing
    ? MISSING_CHANNEL_ID
    : normalizeChannelId(channel || ALERTS_HIGH_CHANNEL_ID);

  const messageId = pickAny(data, ['messageId', 'message_id', 'mid', 'google.message_id']);
  const collapseKey = pickAny(data, ['collapse_key', 'collapseKey']);

  const norm = {
    id,
    rawUrl,
    categoryOrType,
    channel,
    channelResolved,
    isMissing,
    domain,
    messageId,
    collapseKey,
    _raw: data,
  };
  log('🧾 normalize →', norm);
  return norm;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
const ROUTES = {
  public: (id) => `/public-alerts/${encodeURIComponent(id)}`,
  missing: (id) => `/missing-public-alerts/${encodeURIComponent(id)}`,
};

function routeFromData(data = {}) {
  const t0 = Date.now();
  const norm = normalizePayload(data);
  const { id: alertId, rawUrl, isMissing, domain, _raw } = norm;
  if (!alertId) {
    dWarn(domain, '🧩 route: id manquant (alertId|caseId|id)');
    return;
  }

  // anti double tap 1.2s
  const now = Date.now();
  if (G.__VIGI_NOTIF.lastTap.id === alertId && now - (G.__VIGI_NOTIF.lastTap.ts || 0) < 1200) {
    dWarn(domain, '⏱️ double route évitée (1.2s) pour', alertId);
    return;
  }
  G.__VIGI_NOTIF.lastTap = { id: alertId, ts: now };

  const link = (rawUrl || '').trim();
  if (link && link.toLowerCase().startsWith('vigiapp://')) {
    const { ok } = validateDeepLink(link);
    if (!ok) {dWarn(domain, '🔗 deeplink douteux (on tente quand même) →', link);}
    let path = link.replace(/^vigiapp:\/\//i, '/');
    if (/^\/missing\/[^/]+/i.test(path)) {
      const id = path.split('/').pop();
      path = ROUTES.missing(id);
    }
    dLog(domain, '🧭 router.push (deepLink) →', path, `⏱️${Date.now() - t0}ms`);
    router.push(path);
    return;
  }

  if (isMissing) {
    const path = ROUTES.missing(alertId);
    dLog(domain, '🧭 router.push (missing) →', path, `⏱️${Date.now() - t0}ms`);
    router.push(path);
    return;
  }

  const openTarget = String(_raw?.openTarget || data?.openTarget || 'detail').toLowerCase();
  if (openTarget === 'home') {
    const path = `/(tabs)/home?fromNotif=1&alertId=${encodeURIComponent(alertId)}`;
    dLog(domain, '🧭 router.push →', path, `⏱️${Date.now() - t0}ms`);
    router.push(path);
  } else {
    const path = ROUTES.public(alertId);
    dLog(domain, '🧭 router.push →', path, `⏱️${Date.now() - t0}ms`);
    router.push(path);
  }
}

// ---------------------------------------------------------------------------
// Listeners (FG + Tap) — anti double attach/HMR
// ---------------------------------------------------------------------------
export function attachNotificationListeners({ onReceive, onResponse } = {}) {
  log('👂 attachNotificationListeners()');
  ensureNotificationHandler();

  if (G.__VIGI_NOTIF.listenersSet) {
    log('👂 Listeners déjà attachés — skip');
    return () => {};
  }
  G.__VIGI_NOTIF.listenersSet = true;

  // FG receive
  const sub1 = Notifications.addNotificationReceivedListener((n) => {
    try {
      const content = n?.request?.content || {};
      const d0 = content?.data ?? {};
      const d = maybeParseData(d0);
      log('📥 received(FG) → data =', JSON.stringify(d));

      const norm = normalizePayload(d);
      const { id, domain, channelResolved, isMissing } = norm;

      dLog(
        domain,
        'receive(FG)',
        `id=${id || '<no-id>'}`,
        `title=${!!content?.title}`,
        `body=${!!content?.body}`,
        `ch=${channelResolved}`,
      );

      // Dédup 60s par ID (si présent)
      if (id) {
        const now = Date.now();
        const last = G.__VIGI_NOTIF.receivedRecently.get(id) || 0;
        if (now - last < RECEIVE_DEDUP_MS) {
          dWarn(domain, '🧯 dedupe(FG): ignore id', id, `(age=${now - last}ms)`);
          return;
        }
        G.__VIGI_NOTIF.receivedRecently.set(id, now);
      }

      // Fallback UI local si data-only (Android)
      if (Platform.OS === 'android' && !content?.title && !content?.body) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: d?.title || (isMissing ? 'VigiApp — Missing' : 'VigiApp — Alerte'),
            body: d?.body || 'Nouvelle notification',
            data: { ...d, __localFallback: 1 },
            channelId: channelResolved,
          },
          trigger: null,
        })
          .then((nid) =>
            dLog(domain, '🧩 fallback local schedulé', `nid=${nid}`, `id=${id || 'n/a'}`),
          )
          .catch((e) => dWarn(domain, 'fallback local notif:', e?.message || e));
      }

      // ACK receive (public seulement)
      if (id) {
        if (isMissing) {
          dLog(domain, '♻️ ACK receive SKIP (missing) id=', id);
        } else {
          dLog(domain, '♻️ ACK receive SEND id=', id);
          ackAlertSafe({ ...d, id }, 'receive', { isMissing: false });
        }
      }

      try {
        onReceive?.(n);
      } catch (e) {
        dWarn(domain, 'onReceive callback error:', e?.message || e);
      }
    } catch (e) {
      err('received(FG) handler:', e?.message || e);
    }
  });

  // Tap
  const sub2 = Notifications.addNotificationResponseReceivedListener((r) => {
    try {
      const n = r?.notification;
      const d0 = n?.request?.content?.data ?? {};
      const d = maybeParseData(d0);
      log('👆 TAP response →', JSON.stringify(d));

      const norm = normalizePayload(d);
      const { id, domain, isMissing } = norm;

      dLog(domain, 'TAP', `id=${id || '<no-id>'}`);

      if (id) {
        dLog(domain, '♻️ ACK tap SEND id=', id);
        ackAlertSafe({ ...d, id }, 'tap', { isMissing });
      }

      if (!G.__VIGI_NOTIF.authReady) {
        G.__VIGI_NOTIF.pendingNotifData = d;
        dWarn(domain, '⛓️ auth gate: navigation différée');
      } else {
        routeFromData(d);
      }
      try {
        onResponse?.(r);
      } catch (e) {
        dWarn(domain, 'onResponse callback error:', e?.message || e);
      }
    } catch (e) {
      err('tap handler:', e?.message || e);
    }
  });

  log('👂 Listeners attachés ✅');
  return () => {
    try {
      sub1?.remove?.();
      log('🧹 detachNotif sub1 OK');
    } catch (e) {
      warn('🧹 detachNotif sub1 error:', e?.message || e);
    }
    try {
      sub2?.remove?.();
      log('🧹 detachNotif sub2 OK');
    } catch (e) {
      warn('🧹 detachNotif sub2 error:', e?.message || e);
    }
    G.__VIGI_NOTIF.listenersSet = false;
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
    projectId ? { projectId } : undefined,
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
// ACK (idempotent) — URL résolue/cachée
// ---------------------------------------------------------------------------
function ackAlertSafe(data, reason, { isMissing = false } = {}) {
  const id = (
    data?.alertId ||
    data?.caseId ||
    data?.id ||
    data?.alert_id ||
    data?.case_id ||
    ''
  ).toString();
  if (!id) {
    warn('ACK skip: id manquant');
    return;
  }

  const key = `${id}|${reason}`;
  if (G.__VIGI_NOTIF.acked.has(key)) {
    log('♻️ ACK ignoré (idempotent):', key);
    return;
  }
  G.__VIGI_NOTIF.acked.add(key);

  const domain = isMissing ? 'missing' : 'public';
  dLog(domain, 'ACK prepare', { id, reason });

  const extra = {
    channelId: String(data?.channelId || data?.channel_id || ''),
    appOpenTarget: String(data?.openTarget || ''),
    category: String(data?.category || data?.type || '').toLowerCase(),
  };
  ackAlert({ alertId: id, reason, extra, isMissing });
}

async function pickWorkingAckUrlOnce({ candidates, cacheKey }) {
  if (G.__VIGI_NOTIF[cacheKey]) {return G.__VIGI_NOTIF[cacheKey];}
  for (const url of candidates) {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      if (resp.ok || resp.status === 405 || resp.status === 400) {
        G.__VIGI_NOTIF[cacheKey] = url;
        return url;
      }
    } catch {
      /* ignore */
    }
  }
  G.__VIGI_NOTIF[cacheKey] = candidates[0];
  return candidates[0];
}

async function ackAlert({ alertId, reason = 'receive', extra = {}, isMissing = false }) {
  try {
    const domain = isMissing ? 'missing' : 'public';
    const uid = auth?.currentUser?.uid || '';
    let fcmToken = null;
    try {
      const tok = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
      fcmToken = tok?.data || null;
    } catch (e) {
      dWarn(domain, 'ack: getDevicePushTokenAsync:', e?.message || e);
    }

    const body = {
      alertId,
      reason: String(reason).toLowerCase(),
      userId: uid || '',
      fcmToken: fcmToken || '',
      platform: (Platform.OS || 'unknown').toLowerCase(),
      ...extra,
      domain,
    };

    let url;
    if (isMissing && ACK_MISSING_ENDPOINT) {
      url = ACK_MISSING_ENDPOINT;
    } else {
      url = await pickWorkingAckUrlOnce({
        candidates: ACK_PUBLIC_URL_CANDIDATES,
        cacheKey: 'ackUrlPublic',
      });
    }

    dLog(domain, 'ACK POST', { url, alertId, reason: body.reason });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let j = {};
    try {
      j = await resp.json();
    } catch {}
    dLog(domain, 'ACK RESP', {
      alertId,
      reason: body.reason,
      status: resp.status,
      ok: resp.ok,
      json: j,
    });

    if (!resp.ok && resp.status === 404 && url === ACK_PUBLIC_URL_CANDIDATES[0]) {
      G.__VIGI_NOTIF.ackUrlPublic = ACK_PUBLIC_URL_CANDIDATES[1];
      dWarn(domain, 'ACK fallback → CamelCase');
      const resp2 = await fetch(G.__VIGI_NOTIF.ackUrlPublic, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      let j2 = {};
      try {
        j2 = await resp2.json();
      } catch {}
      dLog(domain, 'ACK RESP (fallback)', { status: resp2.status, ok: resp2.ok, json: j2 });
    }
  } catch (e) {
    const domain = isMissing ? 'missing' : 'public';
    dWarn(domain, 'ACK FAIL', alertId, reason, e?.message || e);
  }
}

// ---------------------------------------------------------------------------
// Tests locaux
// ---------------------------------------------------------------------------
export async function fireLocalNow(data = {}) {
  const channelId = normalizeChannelId(String(data?.channelId || ALERTS_HIGH_CHANNEL_ID));
  return Notifications.scheduleNotificationAsync({
    content: { title: 'VigiApp (local)', body: 'Celle-ci est locale', data, channelId },
    trigger: null,
  });
}

export async function scheduleLocalIn(seconds = 5, data = {}) {
  const channelId = normalizeChannelId(String(data?.channelId || ALERTS_HIGH_CHANNEL_ID));
  return Notifications.scheduleNotificationAsync({
    content: { title: 'VigiApp (local)', body: `Programmée +${seconds}s`, data, channelId },
    trigger: { seconds },
  });
}

export async function cancelAll() {
  return Notifications.cancelAllScheduledNotificationsAsync();
}
