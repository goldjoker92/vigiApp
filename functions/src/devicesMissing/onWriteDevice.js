// =============================================================================
// VigiApp — onWriteDevice (subscribe/unsubscribe FCM topics par tuiles)
// -----------------------------------------------------------------------------
// - Trigger: /devices/{deviceId} (create/update) — region: southamerica-east1
// - Calcule 9 tuiles (centre + 8 voisines) via tilesForRadius(lat,lng)
// - Abonne le FCM token aux topics "missing_geo_<tile>" (noms safe FCM)
// - Désabonne l'ancien token/tuiles si la géo ou le token changent
// - Miroir Expo : /devices_missing/{deviceId} {expoToken, tiles, userId, fcmToken}
// - Idempotent : no-op si rien n'a changé (évite la boucle d’écritures)
// - Tolérant aux champs manquants, logs lisibles
// =============================================================================

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions/v2');
const admin = require('firebase-admin');

let _init = false;
function ensureInit() {
  if (_init) return;
  try { admin.app(); } catch { admin.initializeApp(); }
  _init = true;
}

const REGION = 'southamerica-east1';
const NS = '[DeviceTiles]';

const db = () => admin.firestore();

// --- Tiles (doit retourner un Array<string> de 9 tuiles)
const { tilesForRadius } = require('../libsMissing/geoTiles');

// --- Logs helpers
const nowIso = () => new Date().toISOString();
const log  = (msg, extra = {}) => logger.info(`${NS} ${msg}`, { t: nowIso(), ...extra });
const warn = (msg, extra = {}) => logger.warn(`${NS} ${msg}`, { t: nowIso(), ...extra });
const err  = (msg, extra = {}) => logger.error(`${NS} ${msg}`, { t: nowIso(), ...extra });

// --- Topics helpers (FCM autorise [a-zA-Z0-9-_.~%]+)
function sanitizeTopicPart(s) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9\-_.~%]/g, '-') // remplace chars interdits
    .replace(/-+/g, '-')                 // compresse
    .slice(0, 200);                      // marge large
}
function tileTopic(tile) {
  return `missing_geo_${sanitizeTopicPart(tile)}`;
}

// --- Geo helpers
function pickLatLng(d) {
  const lat = Number.isFinite(+d?.lat) ? +d.lat : Number.isFinite(+d?.geo?.lat) ? +d.geo.lat : null;
  const lng = Number.isFinite(+d?.lng) ? +d.lng : Number.isFinite(+d?.geo?.lng) ? +d.geo.lng : null;
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// --- Arrays diff
function diff(a = [], b = []) {
  const A = new Set(a), B = new Set(b);
  const onlyA = [...A].filter(x => !B.has(x));
  const onlyB = [...B].filter(x => !A.has(x));
  return { onlyA, onlyB };
}

// --- Subscribe/Unsubscribe
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
  { region: REGION, document: 'devices/{deviceId}' },
  async (event) => {
    ensureInit();

    const before = event?.data?.before?.data() || null;
    const after  = event?.data?.after?.data() || null;
    const deviceId = event?.params?.deviceId;

    // Delete => on log et on stop (pas de token fiable pour unsubscribe global)
    if (!after) { log('DELETE', { deviceId }); return; }

    const userId = after.userId || before?.userId || null;

    const oldFcm = before?.fcmToken || before?.fcm || null;
    const newFcm = after?.fcmToken  || after?.fcm  || null;
    const fcmChanged = !!(oldFcm && newFcm && oldFcm !== newFcm);

    const oldExpo = before?.expoPushToken || before?.expo || null;
    const newExpo = after?.expoPushToken  || after?.expo  || null;
    const expoChanged = (oldExpo || null) !== (newExpo || null);

    // Canaux actifs ?
    const channels  = after.channels || {};
    const missingOn = channels.missingAlerts !== false; // default true
    const active    = after.active !== false;

    // Geo
    const point = pickLatLng(after);

    // Cas "skip" : on garde le miroir Expo minimal pour le fanout secondaire
    if (!active || !missingOn || !newFcm || !point) {
      warn('SKIP', { deviceId, userId, active, missingOn, hasFcm: !!newFcm, hasPoint: !!point });
      try {
        await db().collection('devices_missing').doc(deviceId).set({
          userId: userId || null,
          fcmToken: newFcm || null,
          expoToken: newExpo || null,
          tiles: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } catch (e) { warn('devices_missing_mirror_skip', { deviceId, err: e?.message || String(e) }); }
      return;
    }

    // Calcule 9 tuiles
    let newTiles = [];
    try {
      newTiles = tilesForRadius(point.lat, point.lng) || [];
      if (!Array.isArray(newTiles) || newTiles.length === 0) throw new Error('no_tiles');
    } catch (e) {
      err('tiles_compute_fail', { deviceId, userId, err: e?.message || String(e), point });
      return;
    }

    const oldTiles = Array.isArray(before?.tiles) ? before.tiles : [];
    const sameTiles = newTiles.length === oldTiles.length &&
                      newTiles.every((t, i) => t === oldTiles[i]);

    // No-op strict : rien n'a changé (ni tiles, ni tokens) => ne PAS écrire (évite boucle)
    if (!fcmChanged && !expoChanged && sameTiles) {
      log('NOOP', { deviceId, userId });
      return;
    }

    log('BEGIN', {
      deviceId, userId, point,
      oldTiles: oldTiles.length, newTiles: newTiles.length,
      fcmChanged, expoChanged
    });

    // Abonnements / désabonnements
    let subStats = { ok: 0, ko: 0 }, unsubStats = { ok: 0, ko: 0 };

    try {
      if (fcmChanged) {
        // On désabonne l'ancien token de ses anciennes tuiles
        if (oldFcm && oldTiles.length) {
          await unsubscribeTiles(oldFcm, oldTiles).then(s => (unsubStats = s)).catch(() => {});
        }
        // Et on abonne le nouveau token aux nouvelles tuiles
        if (newFcm && newTiles.length) {
          await subscribeTiles(newFcm, newTiles).then(s => (subStats = s)).catch(() => {});
        }
      } else {
        const { onlyA: toSub, onlyB: toUnsub } = diff(newTiles, oldTiles);
        if (toUnsub.length) {
          await unsubscribeTiles(newFcm, toUnsub).then(s => (unsubStats = s)).catch(() => {});
        }
        if (toSub.length) {
          await subscribeTiles(newFcm, toSub).then(s => (subStats = s)).catch(() => {});
        }
      }
    } catch (e) {
      warn('subscribe_flow_error', { deviceId, err: e?.message || String(e) });
    }

    // Écritures conditionnelles (évite le retrigger inutile)
    const writes = [];

    if (!sameTiles) {
      writes.push(
        db().collection('devices').doc(deviceId).set({
          tiles: newTiles,
          tilesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      );
    }

    if (!sameTiles || expoChanged || fcmChanged) {
      writes.push(
        db().collection('devices_missing').doc(deviceId).set({
          userId: userId || null,
          fcmToken: newFcm || null,
          expoToken: newExpo || null,
          tiles: newTiles,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      );
    }

    try { if (writes.length) await Promise.all(writes); } catch (e) {
      warn('tiles_write_fail', { deviceId, err: e?.message || String(e) });
    }

    log('END', {
      deviceId, userId,
      subs_ok: subStats.ok, subs_ko: subStats.ko,
      unsubs_ok: unsubStats.ok, unsubs_ko: unsubStats.ko,
    });
  }
);
