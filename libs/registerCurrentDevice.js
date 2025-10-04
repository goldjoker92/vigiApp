// libs/registerCurrentDevice.js
// ============================================================================
// VigiApp — Orchestrateur d’enregistrement device (Expo Managed)
// - Récupère FCM via expo-notifications (⚠️ pas de @react-native-firebase/messaging)
// - Optionnel: Expo push token (pour métriques / notifications Expo si besoin)
// - Tente une géoloc robuste (mais n’empêche pas l’upsert si elle manque)
// - Upsert Firestore via libs/registerDevice.js (global + per-user)
// - Anti-doublon : snapshotKey ; anti-“stampede” : inFlight
// - Logs homogènes + masquage de token ; codes d’erreurs explicites
// - Auto-refresh: boot, retour foreground (avec debounce), interval 6h
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
const TOKEN_BACKOFF_BASE_MS = 550; // ~0.55s, 1.1s, 1.65s, ...
const GEO_TIMEOUT_MS = 5000;
const FG_DEBOUNCE_MS = 600; // pour laisser le temps au système de rafraîchir le token
const PERIODIC_MS = 6 * 60 * 60 * 1000; // 6h

let inFlight = false;
let lastKey = null;
let lastOkTs = Date.now();
console.log('Last OK timestamp:', lastOkTs);
// or use it in your logic

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
      // data vide → on retente
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
    // projectId auto-resolu par Expo ; on reste tolérant
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
 * - FCM token requis (aligné avec tes rules / envoi FCM).
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

  try {
    // 0) Info permission (diagnostic uniquement, on ne la demande pas ici)
    try {
      const perm = await Notifications.getPermissionsAsync();
      log('Perm snapshot', { status: perm?.status, canAskAgain: perm?.canAskAgain });
    } catch {}

    // 1) Token FCM via Expo
    const fcmDeviceToken = await getFcmTokenExpoWithRetry(TOKEN_RETRIES);
    if (!fcmDeviceToken) {
      warn('FCM introuvable (Expo). Upsert annulé pour respecter les rules.');
      return { ok: false, code: 'no_fcm', error: 'fcmDeviceToken absent' };
    }

    // 2) Expo push token (facultatif)
    const expoPushToken = await getExpoPushTokenSafe();

    // 3) Géoloc robuste (mais non bloquante)
    const loc = await getRobustLocation();
    const lat = Number.isFinite(loc?.lat) ? loc.lat : null;
    const lng = Number.isFinite(loc?.lng) ? loc.lng : null;

    // 4) Payload canonique
    const payload = {
      userId,
      expoPushToken,
      fcmDeviceToken, // requis
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

    // 5) Upsert
    const res = await upsertDevice(payload);
    if (res?.ok) {
      lastKey = key;
      lastOkTs = Date.now();
      log('READY ✅ Device enregistré, éligible réception alertes', {
        deviceId: res.deviceId,
        hasLatLng: !!res.hasLatLng,
        geohash: res.geohash || null,
        cep: payload.cep || null,
        city: payload.city || null,
        fcmMasked: mask(fcmDeviceToken),
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

// ----------------------------------------------------------------------------
// Auto-refresh
// - Boot
// - Retour au foreground (debounce)
// - Tick périodique 6h
// ----------------------------------------------------------------------------
export function attachDeviceAutoRefresh({ userId, userCep, userCity, groups }) {
  if (!userId) {
    warn('attachDeviceAutoRefresh: userId manquant');
    return () => {};
  }

  let fgTimer = null;

  // 1) Boot
  registerCurrentDevice({ userId, userCep, userCity, groups })
    .then((r) => log('boot upsert =>', r))
    .catch(() => {});

  // 2) Retour au foreground (avec petit debounce)
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

  // 3) Refresh périodique (6h)
  const intervalId = setInterval(() => {
    registerCurrentDevice({ userId, userCep, userCity, groups }).catch(() => {});
  }, PERIODIC_MS);

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
