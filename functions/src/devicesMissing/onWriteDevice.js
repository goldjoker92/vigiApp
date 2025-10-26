// =============================================================================
// VigiApp — onWriteDevice (subscribe/unsubscribe FCM topics par tuiles)
// Trigger: /devices/{deviceId} — region: southamerica-east1
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
const NS = '🧩 [DeviceTiles]';

const db = () => admin.firestore();
const { tilesForRadius } = require('../libsMissing/geoTiles');

// --- Utils
const nowIso = () => new Date().toISOString();
const log  = (msg, extra = {}) => logger.info(`${NS} ${msg}`, { t: nowIso(), ...extra });
const warn = (msg, extra = {}) => logger.warn(`${NS} ${msg}`, { t: nowIso(), ...extra });
const err  = (msg, extra = {}) => logger.error(`${NS} ${msg}`, { t: nowIso(), ...extra });

function maskToken(tok) {
  if (!tok) return null;
  const s = String(tok);
  if (s.length <= 8) return '***';
  return `${s.slice(0,4)}…${s.slice(-4)}`;
}

// FCM topic safe
function sanitizeTopicPart(s) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9\-_.~%]/g, '-') // remplace chars interdits
    .replace(/-+/g, '-')                 // compresse
    .slice(0, 200);
}
function tileTopic(tile) {
  return `missing_geo_${sanitizeTopicPart(tile)}`;
}

// Geo
function pickLatLng(d) {
  const lat = Number.isFinite(+d?.lat) ? +d.lat : Number.isFinite(+d?.geo?.lat) ? +d.geo.lat : null;
  const lng = Number.isFinite(+d?.lng) ? +d.lng : Number.isFinite(+d?.geo?.lng) ? +d.geo.lng : null;
  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// Diff arrays
function diff(a = [], b = []) {
  const A = new Set(a), B = new Set(b);
  const onlyA = [...A].filter(x => !B.has(x));
  const onlyB = [...B].filter(x => !A.has(x));
  return { onlyA, onlyB };
}

async function subscribeTiles(fcmToken, tiles) {
  let ok = 0, ko = 0;
  for (const t of tiles) {
    const topic = tileTopic(t);
    console.log('🔔 [SUB] about to subscribe', { topic, token: maskToken(fcmToken) });
    log('🔔 SUB_ABOUT_TO', { topic, tokenMasked: maskToken(fcmToken) });
    try {
      await admin.messaging().subscribeToTopic([fcmToken], topic);
      ok++; console.log('✅ [SUB] success', { topic }); log('✅ SUB_OK', { topic });
    } catch (e) {
      ko++; console.log('❌ [SUB] fail', { topic, err: e?.message || String(e) });
      warn('❌ topic_sub_fail', { topic, err: e?.message || String(e) });
    }
  }
  return { ok, ko };
}

async function unsubscribeTiles(fcmToken, tiles) {
  let ok = 0, ko = 0;
  for (const t of tiles) {
    const topic = tileTopic(t);
    console.log('🧹 [UNSUB] about to unsubscribe', { topic, token: maskToken(fcmToken) });
    log('🧹 UNSUB_ABOUT_TO', { topic, tokenMasked: maskToken(fcmToken) });
    try {
      await admin.messaging().unsubscribeFromTopic([fcmToken], topic);
      ok++; console.log('✅ [UNSUB] success', { topic }); log('✅ UNSUB_OK', { topic });
    } catch (e) {
      ko++; console.log('❌ [UNSUB] fail', { topic, err: e?.message || String(e) });
      warn('❌ topic_unsub_fail', { topic, err: e?.message || String(e) });
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

    console.log('🚀 [TRIGGER] DeviceTiles start', { region: REGION, deviceId, hasBefore: !!before, hasAfter: !!after });
    log('🚀 TRIGGER_START', { deviceId, hasBefore: !!before, hasAfter: !!after });

    if (!after) {
      console.log('🗑️ [DELETE] Device doc deleted', { deviceId });
      log('🗑️ DELETE', { deviceId });
      return;
    }

    const userId = after.userId || before?.userId || null;

    const oldFcm = before?.fcmToken || before?.fcm || null;
    const newFcm = after?.fcmToken  || after?.fcm  || null;
    const fcmChanged = !!(oldFcm && newFcm && oldFcm !== newFcm);

    const oldExpo = before?.expoPushToken || before?.expo || null;
    const newExpo = after?.expoPushToken  || after?.expo  || null;
    const expoChanged = (oldExpo || null) !== (newExpo || null);

    const channels  = after.channels || {};
    const missingOn = channels.missingAlerts !== false; // default true
    const active    = after.active !== false;

    const point = pickLatLng(after);

    if (!active || !missingOn || !newFcm || !point) {
      console.log('⚠️ [SKIP] gating', { deviceId, userId, active, missingOn, hasFcm: !!newFcm, hasPoint: !!point });
      warn('⚠️ SKIP', { deviceId, userId, active, missingOn, hasFcm: !!newFcm, hasPoint: !!point });
      try {
        await db().collection('devices_missing').doc(deviceId).set({
          userId: userId || null,
          fcmToken: newFcm || null,
          expoToken: newExpo || null,
          tiles: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log('🪞 [MIRROR] write empty OK', { deviceId });
      } catch (e) {
        console.log('❌ [MIRROR] write empty FAIL', { deviceId, err: e?.message || String(e) });
        warn('❌ devices_missing_mirror_skip', { deviceId, err: e?.message || String(e) });
      }
      return;
    }

    let newTiles = [];
    try {
      newTiles = tilesForRadius(point.lat, point.lng) || [];
      if (!Array.isArray(newTiles) || newTiles.length === 0) throw new Error('no_tiles');
    } catch (e) {
      console.log('💥 [TILES] compute fail', { deviceId, point, err: e?.message || String(e) });
      err('💥 tiles_compute_fail', { deviceId, userId, err: e?.message || String(e), point });
      return;
    }

    const oldTiles = Array.isArray(before?.tiles) ? before.tiles : [];
    const sameTiles = newTiles.length === oldTiles.length && newTiles.every((t, i) => t === oldTiles[i]);

    if (!fcmChanged && !expoChanged && sameTiles) {
      console.log('😴 [NOOP] nothing changed', { deviceId, userId });
      log('😴 NOOP', { deviceId, userId });
      return;
    }

    console.log('🧭 [BEGIN] tiles update', {
      deviceId, userId, point,
      oldTilesCount: oldTiles.length, newTilesCount: newTiles.length,
      fcmChanged, expoChanged,
      tokenMasked: maskToken(newFcm),
    });
    log('🧭 BEGIN', {
      deviceId, userId, point,
      oldTiles: oldTiles.length, newTiles: newTiles.length,
      fcmChanged, expoChanged
    });

    let subStats = { ok: 0, ko: 0 }, unsubStats = { ok: 0, ko: 0 };
    try {
      if (fcmChanged) {
        if (oldFcm && oldTiles.length) {
          console.log('🧹 [UNSUB] ALL old', { deviceId, oldTilesCount: oldTiles.length, oldToken: maskToken(oldFcm) });
          await unsubscribeTiles(oldFcm, oldTiles).then(s => (unsubStats = s)).catch(() => {});
        }
        if (newFcm && newTiles.length) {
          console.log('🔔 [SUB] ALL new', { deviceId, newTilesCount: newTiles.length, newToken: maskToken(newFcm) });
          await subscribeTiles(newFcm, newTiles).then(s => (subStats = s)).catch(() => {});
        }
      } else {
        const { onlyA: toSub, onlyB: toUnsub } = diff(newTiles, oldTiles);
        if (toUnsub.length) {
          console.log('🧹 [UNSUB] diff', { deviceId, count: toUnsub.length });
          await unsubscribeTiles(newFcm, toUnsub).then(s => (unsubStats = s)).catch(() => {});
        }
        if (toSub.length) {
          console.log('🔔 [SUB] diff', { deviceId, count: toSub.length });
          await subscribeTiles(newFcm, toSub).then(s => (subStats = s)).catch(() => {});
        }
      }
    } catch (e) {
      console.log('⚠️ [FLOW] subscribe error', { deviceId, err: e?.message || String(e) });
      warn('⚠️ subscribe_flow_error', { deviceId, err: e?.message || String(e) });
    }

    const writes = [];
    if (!sameTiles) {
      console.log('✍️ [WRITE] devices.tiles', { deviceId, newTilesCount: newTiles.length });
      writes.push(
        db().collection('devices').doc(deviceId).set({
          tiles: newTiles,
          tilesUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      );
    }

    if (!sameTiles || expoChanged || fcmChanged) {
      console.log('✍️ [WRITE] devices_missing mirror', { deviceId, expoChanged, fcmChanged });
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

    try {
      if (writes.length) {
        await Promise.all(writes);
        console.log('📦 [WRITE] OK', { deviceId, writes: writes.length });
      }
    } catch (e) {
      console.log('❌ [WRITE] FAIL', { deviceId, err: e?.message || String(e) });
      warn('❌ tiles_write_fail', { deviceId, err: e?.message || String(e) });
    }

    console.log('🏁 [END] DeviceTiles', {
      deviceId, userId,
      subs_ok: subStats.ok, subs_ko: subStats.ko,
      unsubs_ok: unsubStats.ok, unsubs_ko: unsubStats.ko,
    });
    log('🏁 END', {
      deviceId, userId,
      subs_ok: subStats.ok, subs_ko: subStats.ko,
      unsubs_ok: unsubStats.ok, unsubs_ko: unsubStats.ko,
    });
  }
);
