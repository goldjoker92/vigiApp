// functions/index.js
// ============================================================================
// VigiApp — Cloud Functions v2 (Node 20)
// HTTP (Gen2 onRequest) + Triggers Firestore (v2)
// Optimisations coût/perf SANS changer la logique métier
// - Région unique
// - HTTP pur onRequest
// - Mémoire réduite sur les HTTP simples
// - Concurrency pour densifier et réduire les cold starts
// - Timeouts côté platform (les fetch externes restent à 900ms dans tes handlers)
// - Endpoints HTTP en minuscules: verifyguardian, sendpublicalertbyaddress, ackpublicalertreceipt
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const { ackpublicalertreceipt } = require('./src/ackpublicalertreceipt');

// ---------- Région & options globales ----------
setGlobalOptions({
  region: 'southamerica-east1',
});

// ---------- Admin idempotent ----------
try {
  admin.app();
} catch {
  admin.initializeApp();
}
const db = () => admin.firestore();

// ===================== HTTP HANDLERS =====================
// ⚠️ chemins fichiers en minuscules
const { verifyGuardian } = require('./src/verifyguardian');
const { sendPublicAlertByAddress } = require('./src/sendpublicalertbyaddress');

// Garde-fous (évite "userProvidedHandler is not a function")
if (typeof verifyGuardian !== 'function') {
  throw new Error('[index] verifyGuardian export is not a function');
}
if (typeof sendPublicAlertByAddress !== 'function') {
  throw new Error('[index] sendPublicAlertByAddress export is not a function');
}

// ---------- Profils coût/perf (sans impact métier) ----------
const httpSmall = { cors: true, memory: '128MiB', timeoutSeconds: 30 /*, concurrency: 20 */ };
// const httpSmall = { cors: true, memory: '128MiB', timeoutSeconds: 30, concurrency: 1 };
const httpStd = { cors: true, memory: '256MiB', timeoutSeconds: 60 /*, concurrency: 20 */ };
// const httpStd = { cors: true, memory: '256MiB', timeoutSeconds: 60, concurrency: 1 };

// ---------- Exports HTTP (MINUSCULES) ----------
exports.verifyguardian = onRequest(httpSmall, verifyGuardian);
exports.sendpublicalertbyaddress = onRequest(httpSmall, sendPublicAlertByAddress);
exports.ackpublicalertreceipt = ackpublicalertreceipt;

// ===================== TRIGGERS Missing (v2) =====================
const { onCreateMissing } = require('./src/missing/oncreatemissing');
const { onUpdateMissing } = require('./src/missing/onupdatemissing');

// Triggers en minuscules (aligné avec ton deploy)
exports.oncreatemissing = onCreateMissing;
exports.onupdatemissing = onUpdateMissing;

// ===================== Helpers communs =====================
const NS = '[DeviceTiles]';
const nowIso = () => new Date().toISOString();
const log = (step, extra = {}) => logger.info(`${NS} ${step}`, { t: nowIso(), ...extra });
const warn = (step, extra = {}) => logger.warn(`${NS} ${step}`, { t: nowIso(), ...extra });
const err = (step, extra = {}) => logger.error(`${NS} ${step}`, { t: nowIso(), ...extra });

// Noms de topics FCM: [a-zA-Z0-9-_.~%]+ — nettoyage + lowercase pour éviter des topics doublons
function sanitizeTopicPart(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\-_.~%]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 200);
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
  const A = new Set(a),
    B = new Set(b);
  const onlyA = [...A].filter((x) => !B.has(x));
  const onlyB = [...B].filter((x) => !A.has(x));
  return { onlyA, onlyB };
}

// ===================== Tiles helper =====================
const { tilesForRadius } = require('./src/libsMissing/geoTiles');

// ===================== Trigger: devices onWrite (v2) =====================
async function subscribeTiles(fcmToken, tiles) {
  let ok = 0,
    ko = 0;
  for (const t of tiles) {
    const topic = tileTopic(t);
    try {
      await admin.messaging().subscribeToTopic([fcmToken], topic);
      ok++;
    } catch (e) {
      ko++;
      warn('topic_sub_fail', { topic, err: e?.message || String(e) });
    }
  }
  return { ok, ko };
}
async function unsubscribeTiles(fcmToken, tiles) {
  let ok = 0,
    ko = 0;
  for (const t of tiles) {
    const topic = tileTopic(t);
    try {
      await admin.messaging().unsubscribeFromTopic([fcmToken], topic);
      ok++;
    } catch (e) {
      ko++;
      warn('topic_unsub_fail', { topic, err: e?.message || String(e) });
    }
  }
  return { ok, ko };
}

exports.onwritedevice = onDocumentWritten({ document: 'devices/{deviceId}' }, async (event) => {
  const before = event?.data?.before?.data() || null;
  const after = event?.data?.after?.data() || null;
  const deviceId = event?.params?.deviceId;

  if (!after) {
    // delete
    log('DELETE', { deviceId });
    try {
      await db()
        .collection('devices_missing')
        .doc(deviceId)
        .set(
          {
            tiles: [],
            fcmToken: null,
            expoToken: null,
            userId: before?.userId || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    } catch (e) {
      warn('devices_missing_mirror_delete', { deviceId, err: e?.message || String(e) });
    }
    return;
  }

  const userId = after.userId || before?.userId || null;
  const fcmToken = after.fcmToken || after.fcm || null;
  const expoToken = after.expoPushToken || after.expo || null;

  const channels = after.channels || {};
  const missingOn = channels.missingAlerts !== false; // par défaut true
  const active = after.active !== false;

  const point = pickLatLng(after);
  if (!active || !missingOn || !fcmToken || !point) {
    warn('SKIP', { deviceId, userId, active, missingOn, hasFcm: !!fcmToken, hasPoint: !!point });
    try {
      await db()
        .collection('devices_missing')
        .doc(deviceId)
        .set(
          {
            userId: userId || null,
            fcmToken: fcmToken || null,
            expoToken: expoToken || null,
            tiles: [],
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    } catch (e) {
      warn('devices_missing_mirror_skip', { deviceId, err: e?.message || String(e) });
    }
    return;
  }

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
    deviceId,
    userId,
    point,
    oldCount: oldTiles.length,
    newCount: newTiles.length,
    toSub: toSub.length,
    toUnsub: toUnsub.length,
  });

  let subStats = { ok: 0, ko: 0 },
    unsubStats = { ok: 0, ko: 0 };
  try {
    if (toSub.length) {
      subStats = await subscribeTiles(fcmToken, toSub);
    }
  } catch {}
  try {
    if (toUnsub.length) {
      unsubStats = await unsubscribeTiles(fcmToken, toUnsub);
    }
  } catch {}

  try {
    await db().collection('devices').doc(deviceId).set(
      {
        tiles: newTiles,
        tilesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await db()
      .collection('devices_missing')
      .doc(deviceId)
      .set(
        {
          userId: userId || null,
          fcmToken: fcmToken || null,
          expoToken: expoToken || null,
          tiles: newTiles,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (e) {
    warn('tiles_write_fail', { deviceId, err: e?.message || String(e) });
  }

  log('END', {
    deviceId,
    userId,
    subs_ok: subStats.ok,
    subs_ko: subStats.ko,
    unsubs_ok: unsubStats.ok,
    unsubs_ko: unsubStats.ko,
  });
});

// ===================== Log de démarrage =====================
console.log('[Index] loaded', {
  http: ['verifyguardian', 'sendpublicalertbyaddress', 'ackpublicalertreceipt'],
  triggers: ['oncreatemissing', 'onupdatemissing', 'onwritedevice'],
});
