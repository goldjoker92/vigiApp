// =============================================================================
// VigiApp — Device register (robuste, traçable, compatible backend)
// -----------------------------------------------------------------------------
// - Upsert global:    /devices/{deviceId}
// - Upsert per-user:  /users/{uid}/devices/{deviceId}
// - Stocke expoPushToken ET fcmDeviceToken (+ alias: expo, fcm) + fcmToken canon
// - active:true, channels.publicAlerts:true, updatedAt: serverTimestamp()
// - lat/lng forcés en Number (contrôles NaN et range) -> geohash (si lat/lng ok)
// - Fallback zone: CEP normalisé (00000000) puis city si fournis
// - deviceId: hash stable du token (taillé court, safe caractères)
// - Logs horodatés + masquage tokens + codes d’erreurs clairs
// =============================================================================

import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

// =============================================================================
// Geohash minimal (précision modérée) sans dépendances externes
// =============================================================================
function encodeGeohash(lat, lng, precision = 7) {
  try {
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let idx = 0,
      bit = 0,
      evenBit = true,
      geohash = '';
    let latMin = -90,
      latMax = 90,
      lonMin = -180,
      lonMax = 180;

    while (geohash.length < precision) {
      if (evenBit) {
        const lonMid = (lonMin + lonMax) / 2;
        if (lng >= lonMid) {
          idx = idx * 2 + 1;
          lonMin = lonMid;
        } else {
          idx = idx * 2;
          lonMax = lonMid;
        }
      } else {
        const latMid = (latMin + latMax) / 2;
        if (lat >= latMid) {
          idx = idx * 2 + 1;
          latMin = latMid;
        } else {
          idx = idx * 2;
          latMax = latMid;
        }
      }
      evenBit = !evenBit;
      if (++bit === 5) {
        geohash += base32.charAt(idx);
        bit = 0;
        idx = 0;
      }
    }
    return geohash;
  } catch {
    return null;
  }
}

// =============================================================================
// Logging utilitaires (ISO) + masquage tokens
// =============================================================================
const ts = () => {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
};
const log = (...a) => {
  try {
    console.log(`[registerDevice][${ts()}]`, ...a);
  } catch {}
};
const warn = (...a) => {
  try {
    console.warn(`[registerDevice][${ts()}] \u26A0\uFE0F`, ...a);
  } catch {}
};
const err = (...a) => {
  try {
    console.error(`[registerDevice][${ts()}] \u274C`, ...a);
  } catch {}
};

function maskToken(tok) {
  if (!tok) {
    return '(empty)';
  }
  const s = String(tok);
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

// =============================================================================
// Hash FNV-1a 64-bit (hex) — stable, léger, sans dépendances
// =============================================================================
function fnv1a64Hex(input) {
  let h1 = 0x2325,
    h2 = 0x8422;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 += (h1 << 1) + (h1 << 4) + (h1 << 5) + (h1 << 7) + (h1 << 8) + (h1 << 40);
    h1 &= 0xffffffff;
    h2 ^= c;
    h2 += (h2 << 1) + (h2 << 4) + (h2 << 5) + (h2 << 7) + (h2 << 8) + (h2 << 40);
    h2 &= 0xffffffff;
  }
  const hi = (h1 >>> 0).toString(16).padStart(8, '0');
  const lo = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hi}${lo}`;
}

// =============================================================================
// Validations tokens (simples mais utiles)
// =============================================================================
function isLikelyFCMToken(t) {
  if (!t) {
    return false;
  }
  return t.includes(':APA91') && t.length > 80; // heuristique simple FCM
}
function isLikelyExpoToken(t) {
  if (!t) {
    return false;
  }
  return /^ExponentPushToken\[[A-Za-z0-9\-_]+\]$/.test(t);
}

// =============================================================================
// ID device stable/sûr depuis tokens disponibles (préfixes utiles)
// =============================================================================
function buildSafeDeviceId({ userId, fcmDeviceToken, expoPushToken }) {
  const src = isLikelyFCMToken(fcmDeviceToken)
    ? `fcm:${fcmDeviceToken}`
    : isLikelyExpoToken(expoPushToken)
      ? `exp:${expoPushToken}`
      : `uid:${userId}|${Platform.OS || 'unk'}`;
  const hash = fnv1a64Hex(src);
  const prefix = src.startsWith('fcm:') ? 'fcm' : src.startsWith('exp:') ? 'expo' : 'usr';
  return `${prefix}_${hash}`;
}

// =============================================================================
// API principale: upsertDevice (JavaScript)
// =============================================================================
/**
 * Upsert device vers Firestore (global + per-user)
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.fcmDeviceToken
 * @param {string=} params.expoPushToken
 * @param {string|number=} params.cep
 * @param {string=} params.city
 * @param {number|string=} params.lat
 * @param {number|string=} params.lng
 * @param {string[]=} params.groups
 * @param {boolean=} params.active
 * @returns {Promise<{ok:boolean, deviceId?:string, hasLatLng?:boolean, geohash?:string|null, code?:string, error?:string}>}
 */
export async function upsertDevice(params) {
  const {
    userId,
    fcmDeviceToken,
    expoPushToken = null,
    cep = null,
    city = null,
    lat = null,
    lng = null,
    groups = [],
    active = true,
  } = params || {};

  // Pré-validations
  if (!userId) {
    warn('userId manquant');
    return { ok: false, code: 'no_user', error: 'userId requis' };
  }
  if (!fcmDeviceToken || !isLikelyFCMToken(fcmDeviceToken)) {
    warn('fcmDeviceToken manquant ou invalide', maskToken(fcmDeviceToken));
    return { ok: false, code: 'no_fcm', error: 'fcmDeviceToken requis/valide' };
  }

  try {
    // Normalisation position (CRITIQUE): forcer Number + contrôler range
    const latN = typeof lat === 'string' ? parseFloat(lat) : lat;
    const lngN = typeof lng === 'string' ? parseFloat(lng) : lng;
    const latOk = typeof latN === 'number' && Number.isFinite(latN) && latN >= -90 && latN <= 90;
    const lngOk = typeof lngN === 'number' && Number.isFinite(lngN) && lngN >= -180 && lngN <= 180;
    const hasLatLng = !!(latOk && lngOk);
    const geohash = hasLatLng ? encodeGeohash(latN, lngN, 7) : null;

    // Fallbacks zone
    const safeCep = cep ? String(cep).replace(/\D+/g, '').slice(0, 8) : null;
    const safeCity = city ? String(city).trim() || null : null;

    // ID stable + tokenHash
    const deviceId = buildSafeDeviceId({ userId, fcmDeviceToken, expoPushToken });
    const tokenHash = fnv1a64Hex(String(fcmDeviceToken));

    const db = getFirestore();
    const now = serverTimestamp();

    // Normalisation groupes
    const safeGroups = Array.isArray(groups)
      ? groups.filter((g) => typeof g === 'string' && g.trim().length > 0).map((g) => g.trim())
      : [];

    // Payload commun — conserve les alias pour compat backend
    const basePayload = {
      userId,
      deviceId, // utile côté requêtes/diagnostic
      platform: Platform.OS || 'unknown',
      type: expoPushToken ? 'expo+fcm' : 'fcm',
      // Tokens (canon + alias)
      fcmToken: fcmDeviceToken,
      fcm: fcmDeviceToken,
      expoPushToken: expoPushToken || null,
      expo: expoPushToken || null,
      tokenHash,
      active: !!active,
      channels: { publicAlerts: true },
      groups: safeGroups,
      updatedAt: now,
      // Zone (clé: forcer Number + geohash si présent)
      ...(hasLatLng ? { lat: latN, lng: lngN, geohash } : {}),
      ...(safeCep ? { cep: safeCep } : {}),
      ...(safeCity ? { city: safeCity } : {}),
    };

    log('START upsert device', {
      deviceId,
      userId,
      platform: basePayload.platform,
      hasLatLng,
      geohash: hasLatLng ? geohash : null,
      hasCEP: !!safeCep,
      hasCity: !!safeCity,
      fcm: maskToken(fcmDeviceToken),
      expo: expoPushToken ? maskToken(expoPushToken) : null,
      groups: safeGroups,
    });

    // 1) Global: /devices/{deviceId}
    try {
      log('→ FS write /devices/%s', deviceId);
      await setDoc(doc(db, 'devices', deviceId), basePayload, { merge: true });
      log('✓ FS ok /devices/%s', deviceId);
    } catch (e) {
      err('global /devices write failed:', e && e.message ? e.message : e);
      throw e;
    }

    // 2) Per-user: /users/{uid}/devices/{deviceId}
    try {
      log('→ FS write /users/%s/devices/%s', userId, deviceId);
      await setDoc(
        doc(db, 'users', userId, 'devices', deviceId),
        { ...basePayload, lastSeenAt: now },
        { merge: true },
      );
      log('✓ FS ok /users/%s/devices/%s', userId, deviceId);
    } catch (e) {
      err('per-user /users/{uid}/devices write failed:', e && e.message ? e.message : e);
      throw e;
    }

    log('END Device upsert OK', { deviceId, userId, hasLatLng, geohash });
    return { ok: true, deviceId, hasLatLng, geohash };
  } catch (e) {
    err('🔥 upsertDevice failed', e && e.message ? e.message : e);
    return { ok: false, code: 'exception', error: e && e.message ? e.message : String(e) };
  }
}

// =============================================================================
// EXEMPLE D’USAGE (dans ton DeviceREG)
// =============================================================================
// import { upsertDevice } from './registerDevice';
// const res = await upsertDevice({
//   userId: uid,
//   fcmDeviceToken: fcmToken,
//   expoPushToken: expoToken,
//   cep: cepStr,
//   city: cityStr,
//   lat: currentLat,    // number ou string numérique
//   lng: currentLng,    // number ou string numérique
//   groups: [],
//   active: true,
// });
// console.log('upsertDevice result', res);
