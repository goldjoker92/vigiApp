// libs/registerDevice.js
// ============================================================================
// VigiApp — Device register (robuste)
// - Upsert global:    /devices/{deviceId}
// - Upsert per-user:  /users/{uid}/devices/{deviceId}
// - Stocke expoPushToken ET fcmDeviceToken
// - active:true, updatedAt: serverTimestamp
// - lat/lng -> geohash (si dispo), CEP sinon (fallback)
// - logs propres + try/catch séparés par écriture
// - deviceId: hash stable du token (évite taille/caractères problématiques)
// ============================================================================

import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

// -- Geohash minimal (précision modérée) sans dépendances
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

// Horodatage lisible pour les logs
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
    console.warn(`[registerDevice][${ts()}] ⚠️`, ...a);
  } catch {}
};
const err = (...a) => {
  try {
    console.error(`[registerDevice][${ts()}] ❌`, ...a);
  } catch {}
};

// Masque de token pour logs
function maskToken(tok) {
  if (!tok) {
    return '(empty)';
  }
  const s = String(tok);
  return s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`;
}

// Sanitize (résidu) — on ne dépend plus de ça pour l’ID final, mais utile ailleurs
// eslint-disable-next-line no-unused-vars
function sanitizeDocId(id) {
  // your sanitization logic
}

// Hash FNV-1a (64-bit en hex) — stable, léger, sans lib
function fnv1a64Hex(input) {
  let h1 = 0x2325; // seeds pseudo-aléatoires pour mixer
  let h2 = 0x8422;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 += (h1 << 1) + (h1 << 4) + (h1 << 5) + (h1 << 7) + (h1 << 8) + (h1 << 40);
    h2 ^= c;
    h2 += (h2 << 1) + (h2 << 4) + (h2 << 5) + (h2 << 7) + (h2 << 8) + (h2 << 40);
    h1 &= 0xffffffff;
    h2 &= 0xffffffff;
  }
  const hi = (h1 >>> 0).toString(16).padStart(8, '0');
  const lo = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hi}${lo}`;
}

// Construit un ID de device stable/safe à partir des tokens disponibles
function buildSafeDeviceId({ userId, fcmDeviceToken, expoPushToken }) {
  const src =
    typeof fcmDeviceToken === 'string' && fcmDeviceToken
      ? `fcm:${fcmDeviceToken}`
      : typeof expoPushToken === 'string' && expoPushToken
        ? `exp:${expoPushToken}`
        : `uid:${userId}|${Platform.OS || 'unk'}`;
  const hash = fnv1a64Hex(src);
  // On garde un préfixe utile pour diagnostiquer l’origine
  const prefix = src.startsWith('fcm:') ? 'fcm' : src.startsWith('exp:') ? 'expo' : 'usr';
  return `${prefix}_${hash}`;
}

/**
 * Upsert device vers Firestore (global + per-user)
 * @param {Object} p
 * @param {string} p.userId             UID Firebase Auth (obligatoire)
 * @param {string} p.fcmDeviceToken     Token FCM natif (obligatoire pour notifier)
 * @param {string} [p.expoPushToken]    Token Expo (optionnel)
 * @param {string} [p.cep]              CEP (recommandé si pas de lat/lng)
 * @param {string} [p.city]             Ville (fallback)
 * @param {number} [p.lat]              Latitude (si dispo)
 * @param {number} [p.lng]              Longitude (si dispo)
 * @param {string[]} [p.groups]         Groupes éventuels
 * @param {boolean} [p.active=true]     Flag actif
 */
export async function upsertDevice({
  userId,
  fcmDeviceToken,
  expoPushToken,
  cep,
  city = null,
  lat = null,
  lng = null,
  groups = [],
  active = true,
}) {
  // Pré-validations (alignées avec les rules)
  if (!userId) {
    warn('❌ userId manquant');
    return { ok: false, code: 'no_user', error: 'userId requis' };
  }
  if (!fcmDeviceToken) {
    warn('❌ fcmDeviceToken manquant');
    return { ok: false, code: 'no_fcm', error: 'fcmDeviceToken requis' };
  }

  try {
    // Position (optionnelle)
    const hasLatLng = Number.isFinite(lat) && Number.isFinite(lng);
    const geohash = hasLatLng ? encodeGeohash(lat, lng, 7) : null;

    // Fallbacks zone
    const safeCep = cep ? String(cep).replace(/\D+/g, '').slice(0, 8) : null;
    const safeCity = city ? String(city).trim() || null : null;

    // ID stable + tokenHash (utile côté back pour dédup)
    const deviceId = buildSafeDeviceId({ userId, fcmDeviceToken, expoPushToken });
    const tokenHash = fnv1a64Hex(String(fcmDeviceToken));

    const db = getFirestore();
    const now = serverTimestamp();

    // Normalisation groupes
    const safeGroups = Array.isArray(groups)
      ? groups.filter((g) => typeof g === 'string' && g.trim().length > 0).map((g) => g.trim())
      : [];

    const basePayload = {
      userId,
      platform: Platform.OS || 'unknown',
      type: expoPushToken ? 'expo+fcm' : 'fcm',
      expoPushToken: expoPushToken || null,
      fcmDeviceToken,
      tokenHash, // 🔎 utile pour requêtes côté serveur si besoin
      active: !!active,
      groups: safeGroups,
      updatedAt: now,
      // zone
      ...(hasLatLng ? { lat, lng, geohash } : {}),
      ...(safeCep ? { cep: safeCep } : {}),
      ...(safeCity ? { city: safeCity } : {}),
    };

    log('📡 Upsert device', {
      deviceId,
      userId,
      hasLatLng,
      hasCEP: !!safeCep,
      hasCity: !!safeCity,
      fcm: maskToken(fcmDeviceToken),
      expo: expoPushToken ? maskToken(expoPushToken) : null,
    });

    // 1) Global: /devices/{deviceId}
    try {
      await setDoc(doc(db, 'devices', deviceId), basePayload, { merge: true });
    } catch (e) {
      err('global /devices write failed:', e?.message || e);
      throw e;
    }

    // 2) Per-user: /users/{uid}/devices/{deviceId}
    try {
      await setDoc(
        doc(db, 'users', userId, 'devices', deviceId),
        { ...basePayload, lastSeenAt: now },
        { merge: true },
      );
    } catch (e) {
      err('per-user /users/{uid}/devices write failed:', e?.message || e);
      throw e;
    }

    log('✅ Device upsert OK', { deviceId, userId });

    return { ok: true, deviceId, hasLatLng, geohash };
  } catch (e) {
    err('🔥 upsertDevice failed', e?.message || e);
    return { ok: false, code: 'exception', error: e?.message || String(e) };
  }
}
