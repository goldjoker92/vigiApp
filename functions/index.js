// functions/index.js
// ============================================================================
// VigiApp — Cloud Functions v2 (Node 20)
// HTTP (Gen2 onRequest) + Triggers Firestore (v2)
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// Région par défaut (v2) — s'applique aux HTTP et aux triggers qui n'override pas.
setGlobalOptions({ region: 'southamerica-east1' });

// Admin App idempotent
try { admin.app(); } catch { admin.initializeApp(); }
const db = () => admin.firestore();

// ===================== HTTP =====================
const { verifyGuardian } = require('./src/verifyguardian');
const { sendPublicAlertByAddress } = require('./src/sendpublicalertbyaddress');

// Garde-fous pour éviter "userProvidedHandler is not a function"
if (typeof verifyGuardian !== 'function') {
  throw new Error('[index] verifyGuardian export is not a function');
}
if (typeof sendPublicAlertByAddress !== 'function') {
  throw new Error('[index] sendPublicAlertByAddress export is not a function');
}

// Exports HTTP (CORS v2)
exports.verifyGuardian = onRequest({ cors: true }, verifyGuardian);
exports.sendPublicAlertByAddress = onRequest({ cors: true }, sendPublicAlertByAddress);

// ===================== Triggers Missing (v2) =====================
const { onCreateMissing } = require('./src/missing/oncreatemissing');
const { onUpdateMissing } = require('./src/missing/onupdtemissing');

exports.onCreateMissing = onCreateMissing;
exports.onUpdateMissing  = onUpdateMissing;

// ===================== Helpers communs =====================
const NS = '[DeviceTiles]';
const nowIso = () => new Date().toISOString();
const log  = (step, extra = {}) => logger.info(`${NS} ${step}`, { t: nowIso(), ...extra });
const warn = (step, extra = {}) => logger.warn(`${NS} ${step}`, { t: nowIso(), ...extra });
const err  = (step, extra = {}) => logger.error(`${NS} ${step}`, { t: nowIso(), ...extra });

// Noms de topics FCM: [a-zA-Z0-9-_.~%]+ — on nettoie agressivement par sûreté.
function sanitizeTopicPart(s) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9\-_.~%]/g, '-')   // remplace chars interdits
    .replace(/-+/g, '-')                    // compresse
    .slice(0, 200);                         // marge large
}
function tileTopic(tile) {
  return `missing_geo_${sanitizeTopicPart(tile)}`;
}

// Récup lat/lng depuis {lat,lng} ou {geo:{lat,lng}}
function pickLatLng(d) {
  const lat = Number.isFinite(+d?.lat) ? +d.lat : Number.isFinite(+d?.geo?.lat) ? +d.geo.lat : null;
  const lng = Number.isFinite(+d?.lng) ? +d.lng : Number.isFinite(+d?.geo?.lng) ? +d.geo.lng : null;
  if (lat === null || lng === null) {return null;}
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {return null;}
  return { lat, lng };
}

function diff(a = [], b = []) {
  const A = new Set(a), B = new Set(b);
  const onlyA = [...A].filter(x => !B.has(x));
  const onlyB = [...B].filter(x => !A.has(x));
  return { onlyA, onlyB };
}

// ===================== Tiles helper =====================
// Doit retourner un Array<string> de 9 tuiles (centre + 8 voisines)
const { tilesForRadius } = require('./src/libsMissing/geoTiles');

// ===================== Trigger: devices onWrite (v2) =====================
// Déclenché sur /devices/{deviceId} (create/update/delete).
// - Calcule 9 tuiles via tilesForRadius(lat,lng)
// - Abonne le token FCM aux topics "missing_geo_<tile>" (noms FCM safe)
// - Désabonne d’anciennes tuiles si la géo a bougé
// - Miroir Expo: /devices_missing/{deviceId} {expoToken, tiles, userId, fcmToken}
// - Idempotent, tolérant aux champs manquants, logs lisibles
async function subscribeTiles(fcmToken, tiles) {
  let ok = 0, ko = 0;
  for (const t of tiles) {
    const topic = tileTopic(t);
    try {
      await admin.messaging().subscribeToTopic([fcmToken], topic);
      ok++;
    } catch (e) {
      ko++; warn('topic_sub_fail', { topic, err: e?.message || String(e) });
    }
  }
  return { ok, ko };
}
async function unsubscribeTiles(fcmToken, tiles) {
  let ok = 0, ko = 0;
  for (const t of tiles) {
    const topic = tileTopic(t);
    try {
      await admin.messaging().unsubscribeFromTopic([fcmToken], topic);
      ok++;
    } catch (e) {
      ko++; warn('topic_unsub_fail', { topic, err: e?.message || String(e) });
    }
  }
  return { ok, ko };
}

exports.onWriteDevice = onDocumentWritten(
  { document: 'devices/{deviceId}' }, // région héritée de setGlobalOptions
  async (event) => {
    const before = event?.data?.before?.data() || null;
    const after  = event?.data?.after?.data() || null;
    const deviceId = event?.params?.deviceId;

    if (!after) { // delete
      log('DELETE', { deviceId });
      // Optionnel: nettoyer le miroir /devices_missing si besoin
      try {
        await db().collection('devices_missing').doc(deviceId).set({
          tiles: [],
          fcmToken: null,
          expoToken: null,
          userId: before?.userId || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (e) { warn('devices_missing_mirror_delete', { deviceId, err: e?.message || String(e) }); }
      return;
    }

    const userId = after.userId || before?.userId || null;
    const fcmToken = after.fcmToken || after.fcm || null;
    const expoToken = after.expoPushToken || after.expo || null;

    // Canaux actifs ?
    const channels = after.channels || {};
    const missingOn = channels.missingAlerts !== false; // par défaut true si non défini
    const active = after.active !== false;

    const point = pickLatLng(after);
    if (!active || !missingOn || !fcmToken || !point) {
      warn('SKIP', { deviceId, userId, active, missingOn, hasFcm: !!fcmToken, hasPoint: !!point });
      // Miroir Expo minimal malgré tout (utile pour autres fanouts)
      try {
        await db().collection('devices_missing').doc(deviceId).set({
          userId: userId || null,
          fcmToken: fcmToken || null,
          expoToken: expoToken || null,
          tiles: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (e) { warn('devices_missing_mirror_skip', { deviceId, err: e?.message || String(e) }); }
      return;
    }

    // Calcule 9 tuiles (même logique que publish)
    let newTiles = [];
    try {
      newTiles = tilesForRadius(point.lat, point.lng) || [];
      if (!Array.isArray(newTiles) || newTiles.length === 0) {throw new Error('no_tiles');}
    } catch (e) {
      err('tiles_compute_fail', { deviceId, userId, err: e?.message || String(e), point });
      return;
    }

    const oldTiles = Array.isArray(before?.tiles) ? before.tiles : [];
    const { onlyA: toSub, onlyB: toUnsub } = diff(newTiles, oldTiles);

    log('BEGIN', {
      deviceId, userId, point,
      oldCount: oldTiles.length, newCount: newTiles.length,
      toSub: toSub.length, toUnsub: toUnsub.length,
    });

    // Abonnements
    let subStats = { ok: 0, ko: 0 }, unsubStats = { ok: 0, ko: 0 };
    try { if (toSub.length)   {subStats = await subscribeTiles(fcmToken, toSub);} } catch {}
    try { if (toUnsub.length) {unsubStats = await unsubscribeTiles(fcmToken, toUnsub);} } catch {}

    // Écrit les tuiles actuelles dans le doc (et miroir Expo)
    try {
      await db().collection('devices').doc(deviceId).set({
        tiles: newTiles,
        tilesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      await db().collection('devices_missing').doc(deviceId).set({
        userId: userId || null,
        fcmToken: fcmToken || null,
        expoToken: expoToken || null,
        tiles: newTiles,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      warn('tiles_write_fail', { deviceId, err: e?.message || String(e) });
    }

    log('END', {
      deviceId,
      userId,
      subs_ok: subStats.ok, subs_ko: subStats.ko,
      unsubs_ok: unsubStats.ok, unsubs_ko: unsubStats.ko,
    });
  }
);

// ===================== Log de démarrage =====================
console.log('[Index] loaded', {
  http: ['verifyGuardian', 'sendPublicAlertByAddress'],
  triggers: ['onCreateMissing', 'onUpdateMissing', 'onWriteDevice'],
});
