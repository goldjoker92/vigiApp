// ============================================================================
// VigiApp — Orchestrateur d’enregistrement device (Expo Managed)
// ----------------------------------------------------------------------------
// - Récupère FCM via expo-notifications (⚠️ pas de @react-native-firebase/messaging)
// - Optionnel: Expo push token (métriques / fallback Expo)
// - Géoloc robuste (non bloquante)
// - Upsert Firestore via libs/registerDevice.js (global + per-user)
// - Anti-doublon : snapshotKey ; anti-“stampede” : inFlight
// - Auto-refresh: boot, retour foreground (debounce), interval 6h
// ----------------------------------------------------------------------------
// 📝 Mémo logging :
//   - START registerCurrentDevice + permissions snapshot
//   - FCM fetched / retry, Expo token, Geo OK
//   - END READY (device enregistré) ou Upsert KO / exception
// ============================================================================

import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getDeviceLocation } from './getDeviceLocation';
import { upsertDevice } from './registerDevice';

const log = (...a) => {
  try {
    console.log('[DeviceREG]', ...a);
  } catch {}
};
const warn = (...a) => {
  try {
    console.warn('[DeviceREG] ⚠️', ...a);
  } catch {}
};
const err = (...a) => {
  try {
    console.error('[DeviceREG] ❌', ...a);
  } catch {}
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOKEN_RETRIES = 5;
const TOKEN_BACKOFF_BASE_MS = 550;
const GEO_TIMEOUT_MS = 5000;
const FG_DEBOUNCE_MS = 600;
const PERIODIC_MS = 6 * 60 * 60 * 1000; // 6h

let inFlight = false;
let lastKey = null;
let lastOkTs = 0;

function mask(tok) {
  if (!tok) {
    return '(empty)';
  }
  const s = String(tok);
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function normalizeCep(cep) {
  const d = String(cep || '').replace(/\D+/g, '');
  return d.length === 8 ? d : null;
}

function snapshotKey(p) {
  const lat = Number.isFinite(p.lat) ? p.lat.toFixed(4) : 'null';
  const lng = Number.isFinite(p.lng) ? p.lng.toFixed(4) : 'null';
  const cep = p.cep || 'null';
  const fcm = (p.fcmDeviceToken || '').slice(0, 16);
  const expo = (p.expoPushToken || '').slice(0, 16);
  const groups = Array.isArray(p.groups) ? p.groups.join(',') : '';
  return `${p.userId}|${fcm}|${expo}|${lat}|${lng}|${cep}|${groups}|${p.active ? 1 : 0}`;
}

async function getFcmTokenExpoWithRetry(maxTries = TOKEN_RETRIES) {
  let lastError = null;
  for (let i = 1; i <= maxTries; i++) {
    try {
      const { data } = await Notifications.getDevicePushTokenAsync({ type: 'fcm' });
      if (typeof data === 'string' && data.length > 0) {
        log('FCM fetched ✅', mask(data));
        return data;
      }
      lastError = new Error('empty_fcm_token');
    } catch (e) {
      lastError = e;
    }
    const wait = Math.floor(TOKEN_BACKOFF_BASE_MS * i);
    warn(`FCM retry #${i} in ${wait}ms`, lastError?.message || lastError || '');
    await sleep(wait);
  }
  warn('FCM token unavailable after retries');
  return null;
}

async function getExpoPushTokenSafe() {
  try {
    const resp = await Notifications.getExpoPushTokenAsync();
    const tok = resp?.data || null;
    if (tok) {
      log('ExpoPush fetched ✅', mask(tok));
    }
    return tok;
  } catch (e) {
    warn('ExpoPush fetch error', e?.message || e);
    return null;
  }
}

async function getRobustLocation() {
  try {
    const loc = await getDeviceLocation({ enableHighAccuracy: true, timeoutMs: GEO_TIMEOUT_MS });
    if (Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) {
      log('Geo OK', { lat: Number(loc.lat).toFixed(5), lng: Number(loc.lng).toFixed(5) });
      return loc;
    }
    warn('Geo invalid shape', loc);
    return null;
  } catch (e) {
    warn('Geo error', e?.message || e);
    return null;
  }
}

/**
 * Enregistre/rafraîchit le device de l’utilisateur courant.
 * - Ne bloque pas si géoloc indispo : on upsert quand même avec CEP/city.
 * - FCM token requis.
 */
export async function registerCurrentDevice({
  userId,
  userCep,
  userCity,
  groups = [],
  force = false,
} = {}) {
  if (!userId) {
    return { ok: false, code: 'no_user', error: 'userId requis' };
  }
  if (inFlight) {
    return { ok: false, code: 'busy', error: 'in-flight' };
  }
  inFlight = true;

  log('START registerCurrentDevice', { userId });

  try {
    // Permissions snapshot (diagnostic only)
    try {
      const perm = await Notifications.getPermissionsAsync();
      log('Perm snapshot', { status: perm?.status, canAskAgain: perm?.canAskAgain });
    } catch {}

    // FCM token via Expo
    const fcmDeviceToken = await getFcmTokenExpoWithRetry(TOKEN_RETRIES);
    if (!fcmDeviceToken) {
      warn('FCM introuvable (Expo). Upsert annulé pour respecter les règles.');
      return { ok: false, code: 'no_fcm', error: 'fcmDeviceToken absent' };
    }

    // Expo push token (facultatif)
    const expoPushToken = await getExpoPushTokenSafe();

    // Géoloc robuste (non bloquante)
    const loc = await getRobustLocation();
    const lat = Number.isFinite(loc?.lat) ? loc.lat : null;
    const lng = Number.isFinite(loc?.lng) ? loc.lng : null;

    // Payload canonique
    const payload = {
      userId,
      expoPushToken,
      fcmDeviceToken,
      cep: normalizeCep(userCep),
      city: userCity?.trim?.() || null,
      lat,
      lng,
      groups,
      active: true,
    };

    const key = snapshotKey(payload);
    if (!force && key === lastKey) {
      log('Skip upsert (no diff)');
      return { ok: true, skipped: true, reason: 'no-diff' };
    }

    // Upsert
    const res = await upsertDevice(payload);
    if (res?.ok) {
      lastKey = key;
      lastOkTs = Date.now();
      log('END READY ✅ Device enregistré', {
        deviceId: res.deviceId,
        hasLatLng: !!res.hasLatLng,
        geohash: res.geohash || null,
        cep: payload.cep || null,
        city: payload.city || null,
        fcmMasked: mask(fcmDeviceToken),
        lastOkTs,
      });
    } else {
      warn('Upsert KO', res);
    }
    return res;
  } catch (e) {
    const msg = e?.message || String(e);
    err('registerCurrentDevice fatal', msg);
    return { ok: false, code: 'exception', error: msg };
  } finally {
    inFlight = false;
  }
}

// Auto-refresh (boot, foreground debounce, périodique)
export function attachDeviceAutoRefresh({ userId, userCep, userCity, groups }) {
  if (!userId) {
    warn('attachDeviceAutoRefresh: userId manquant');
    return () => {};
  }

  let fgTimer = null;

  // Boot
  registerCurrentDevice({ userId, userCep, userCity, groups })
    .then((r) => log('boot upsert =>', r))
    .catch(() => {});

  // Foreground (debounce)
  const onState = (s) => {
    if (s === 'active') {
      if (fgTimer) {
        clearTimeout(fgTimer);
        fgTimer = null;
      }
      fgTimer = setTimeout(() => {
        registerCurrentDevice({ userId, userCep, userCity, groups }).catch(() => {});
      }, FG_DEBOUNCE_MS);
    }
  };
  const unsubAppState = AppState.addEventListener('change', onState);

  // Périodique 6h
  const intervalId = setInterval(() => {
    registerCurrentDevice({ userId, userCep, userCity, groups }).catch(() => {});
  }, PERIODIC_MS);

  // Unsubscribe
  return () => {
    try {
      unsubAppState?.remove?.();
    } catch {}
    try {
      clearInterval(intervalId);
    } catch {}
    try {
      if (fgTimer) {
        clearTimeout(fgTimer);
      }
    } catch {}
  };
}
