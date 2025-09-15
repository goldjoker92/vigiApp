// libs/registerDevice.js
import { getFirestore, setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Platform } from 'react-native';

// Enregistre/MAJ un device dans Firestore
// NOTE: ici on stocke par token Expo (docId = token). Si tu préfères par userId+deviceId, dis-moi.
export async function upsertDevice({
  userId = 'ANON',
  expoPushToken,
  cep,
  lat = null,
  lng = null,
  geohash = null,
  groups = [],
}) {
  if (!expoPushToken) {
    return { ok: false, error: 'expoPushToken requis' };
  }
  if (!cep) {
    return { ok: false, error: 'CEP requis' };
  }

  const db = getFirestore();

  // Les tokens Expo n'ont pas de "/", mais on sécurise
  const docId = expoPushToken.replace(/\//g, '_');
  const ref = doc(db, 'devices', docId);

  const payload = {
    userId,
    token: expoPushToken,
    type: 'expo', // tu pourras gérer 'fcm' si tu mixes
    cep: String(cep),
    platform: Platform.OS,
    lat,
    lng,
    geohash,
    groups: Array.isArray(groups) ? groups : [],
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, payload, { merge: true });
  return { ok: true };
}
