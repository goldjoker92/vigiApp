// libs/registerDevice.js
// ============================================================
// VigiApp — Register Device util
// - Upsert device en Firestore
// - Stocke expoPushToken ET fcmDeviceToken
// - CEP obligatoire (lié aux groupes), mais pas aux alertes publiques
// - Logs détaillés pour debug
// ============================================================

import { getFirestore, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';

// Util log horodaté
function ts() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}
function log(...args) {
  try {
    console.log(`[registerDevice][${ts()}]`, ...args);
  } catch {}
}
function warn(...args) {
  try {
    console.warn(`[registerDevice][${ts()}]`, ...args);
  } catch {}
}
function err(...args) {
  try {
    console.error(`[registerDevice][${ts()}]`, ...args);
  } catch {}
}

/**
 * Enregistre ou met à jour un device dans Firestore
 * @param {Object} params
 * @param {string} params.userId - UID Firebase Auth
 * @param {string} params.expoPushToken - Token Expo (docId utilisé)
 * @param {string} params.fcmDeviceToken - Token FCM natif (optionnel mais recommandé)
 * @param {string} params.cep - CEP (obligatoire pour logique groupe)
 * @param {number|null} params.lat - latitude (optionnelle)
 * @param {number|null} params.lng - longitude (optionnelle)
 * @param {string|null} params.geohash - geohash si calculé
 * @param {Array} params.groups - liste d’IDs de groupes liés
 */
export async function upsertDevice({
  userId = 'ANON',
  expoPushToken,
  fcmDeviceToken = null,
  cep,
  lat = null,
  lng = null,
  geohash = null,
  groups = [],
}) {
  try {
    // Vérifs obligatoires
    if (!expoPushToken) {
      warn('❌ expoPushToken manquant');
      return { ok: false, error: 'expoPushToken requis' };
    }
    if (!cep) {
      warn('❌ CEP manquant (obligatoire pour devices enregistrés)');
      return { ok: false, error: 'CEP requis' };
    }

    const db = getFirestore();

    // Sécurisation du docId (Expo tokens n'ont pas de "/" mais on anticipe)
    const docId = expoPushToken.replace(/\//g, '_');
    const ref = doc(db, 'devices', docId);

    // Payload final
    const payload = {
      userId,
      expoPushToken,
      fcmDeviceToken, // ✅ nouveau champ
      type: 'expo+fcm', // trace qu’on stocke les deux
      cep: String(cep),
      platform: Platform.OS,
      lat,
      lng,
      geohash,
      groups: Array.isArray(groups) ? groups : [],
      updatedAt: serverTimestamp(),
    };

    log('📡 Upserting device', { docId, userId, cep, hasFCM: !!fcmDeviceToken });

    await setDoc(ref, payload, { merge: true });

    log('✅ Device enregistré/MAJ avec succès', docId);
    return { ok: true };
  } catch (e) {
    err('🔥 Erreur upsertDevice', e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}
// Fin registerDevice.js
