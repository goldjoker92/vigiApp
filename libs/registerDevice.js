// libs/registerDevice.js
// ============================================================================
// VigiApp — Device register (robuste)
// - Upsert global:    /devices/{deviceId}
// - Upsert per-user:  /users/{uid}/devices/{deviceId}
// - Stocke expoPushToken ET fcmDeviceToken
// - active:true, updatedAt: serverTimestamp
// - lat/lng -> geohash (si dispo), CEP sinon (fallback)
// - logs propres + try/catch séparés par écriture
// ============================================================================

import { Platform } from 'react-native';
import { doc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';

// -- Geohash minimal (précision modérée) sans dépendances
function encodeGeohash(lat, lng, precision = 7) {
  try {
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let idx = 0, bit = 0, evenBit = true, geohash = '';
    let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
    while (geohash.length < precision) {
      if (evenBit) {
        const lonMid = (lonMin + lonMax) / 2;
        if (lng >= lonMid) { idx = idx * 2 + 1; lonMin = lonMid; }
        else { idx = idx * 2; lonMax = lonMid; }
      } else {
        const latMid = (latMin + latMax) / 2;
        if (lat >= latMid) { idx = idx * 2 + 1; latMin = latMid; }
        else { idx = idx * 2; latMax = latMid; }
      }
      evenBit = !evenBit;
      if (++bit === 5) { geohash += base32.charAt(idx); bit = 0; idx = 0; }
    }
    return geohash;
  } catch {
    return null;
  }
}

// Horodatage lisible pour les logs
const ts = () => {
  try { return new Date().toISOString(); } catch { return String(Date.now()); }
};
const log  = (...a) => { try { console.log(`[registerDevice][${ts()}]`, ...a); } catch {} };
const warn = (...a) => { try { console.warn(`[registerDevice][${ts()}]`, ...a); } catch {} };
const err  = (...a) => { try { console.error(`[registerDevice][${ts()}]`, ...a); } catch {} };

// Sanitize d’un ID de document (évite caractères pénibles)
function sanitizeDocId(s) {
  if (!s) { return null; }
  return String(s).replace(/[\/\\#\?\:\[\]\$\.]/g, '_'); // remplace / \ # ? : [ ] $ .
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
    return { ok: false, error: 'userId requis' };
  }
  if (!fcmDeviceToken) {
    warn('❌ fcmDeviceToken manquant');
    return { ok: false, error: 'fcmDeviceToken requis' };
  }

  try {
    // Position (optionnelle)
    const hasLatLng = Number.isFinite(lat) && Number.isFinite(lng);
    const geohash = hasLatLng ? encodeGeohash(lat, lng, 7) : null;

    // Fallbacks zone
    const safeCep  = cep  ? String(cep).replace(/\D+/g, '') : null; // garde 8 chiffres si déjà propre
    const safeCity = city ? String(city).trim() : null;

    // ID stable → on préfère le FCM; sinon Expo; sinon fallback
    const candidateId = fcmDeviceToken || expoPushToken || `${userId}-device-${Platform.OS || 'unk'}`;
    const deviceId = sanitizeDocId(candidateId);

    const db  = getFirestore();
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
    return { ok: false, error: e?.message || String(e) };
  }
}
